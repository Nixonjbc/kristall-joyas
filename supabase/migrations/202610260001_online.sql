-- Requires licensing/supabase/schema.sql. Additive: never activates a license.
begin;
create schema if not exists kristall_private;
revoke all on schema kristall_private from public, anon, authenticated;
create table kristall_private.members (
 business_id uuid references public.license_businesses(id),
 user_id uuid references auth.users(id), active boolean not null default true,
 primary key(business_id,user_id)
);
create table kristall_private.admins (user_id uuid primary key references auth.users(id));
create table kristall_private.ledgers (
 business_id uuid primary key references public.license_businesses(id),
 version bigint not null default 0,
 data jsonb not null default '{"version":2,"clients":[],"moves":[]}'
);
create table kristall_private.events (
 id bigint generated always as identity primary key,
 business_id uuid not null references public.license_businesses(id),
 request_id uuid not null, actor uuid not null, action text not null,
 version bigint not null, before_data jsonb not null, after_data jsonb not null,
 created_at timestamptz not null default now(), unique(business_id,request_id)
);
alter table kristall_private.members enable row level security;
alter table kristall_private.admins enable row level security;
alter table kristall_private.ledgers enable row level security;
alter table kristall_private.events enable row level security;
revoke all on all tables in schema kristall_private from public, anon, authenticated;
revoke all on all sequences in schema kristall_private from public, anon, authenticated;

create function kristall_private.assert_access(b uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from kristall_private.members where business_id=b and user_id=auth.uid() and active) then
 raise exception 'Acceso al negocio denegado' using errcode='42501'; end if;
 -- Lock the license too: a concurrent suspension cannot race a transaction.
 perform 1 from public.licenses l join public.license_businesses x on x.id=l.business_id
 where l.business_id=b and x.product_id='joyerias' and l.status='active'
 and l.revoked_at is null and l.paid_through >= (now() at time zone 'America/Caracas')::date for share of l;
 if not found then raise exception 'Licencia pendiente, vencida o suspendida' using errcode='42501'; end if;
end $$;

create function public.kj_account() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('admin', exists(select 1 from kristall_private.admins where user_id=auth.uid()),
 'businesses',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.display_name,'status',l.status,'paidThrough',l.paid_through,'priceCents',l.monthly_price_cents))
 from kristall_private.members m join public.license_businesses b on b.id=m.business_id
 left join public.licenses l on l.business_id=b.id
 where m.user_id=auth.uid() and m.active and b.product_id='joyerias'),'[]'::jsonb))
$$;
create function public.kj_read(b uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 perform kristall_private.assert_access(b);
 select jsonb_build_object('version',version,'data',data) into r from kristall_private.ledgers where business_id=b;
 return coalesce(r,'{"version":0,"data":{"version":2,"clients":[],"moves":[]}}'::jsonb);
end $$;

create function kristall_private.validate(d jsonb) returns void
language plpgsql set search_path='' as $$
declare c jsonb; m jsonb; total numeric; amount numeric;
begin
 if jsonb_typeof(d->'clients') is distinct from 'array' or jsonb_typeof(d->'moves') is distinct from 'array' then raise exception 'Formato inválido'; end if;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(d->'clients')) or
 (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(d->'moves')) then raise exception 'Identificadores duplicados'; end if;
 for c in select value from jsonb_array_elements(d->'clients') loop
 perform (c->>'id')::uuid;
 if c->>'id' is null or length(trim(coalesce(c->>'name','')))=0 or length(c->>'name')>120 then raise exception 'Cliente inválido'; end if;
 end loop;
 for m in select value from jsonb_array_elements(d->'moves') loop
 perform (m->>'id')::uuid;
 if m->>'id' is null or m->>'type' is null or m->>'type' not in ('credit','payment') or
 not exists(select 1 from jsonb_array_elements(d->'clients') cl where cl->>'id'=m->>'clientId') then raise exception 'Movimiento inválido'; end if;
 if jsonb_typeof(m->'amount') is distinct from 'number' then raise exception 'Monto inválido'; end if;
 amount=(m->>'amount')::numeric;
 if amount<=0 or amount>999999999.99 or amount<>round(amount,2) then raise exception 'Monto inválido'; end if;
 if coalesce(m->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Fecha inválida'; end if;
 perform (m->>'date')::date;
 if jsonb_typeof(m->'revisions') is distinct from 'array' then raise exception 'Correcciones inválidas'; end if;
 end loop;
 for c in select value from jsonb_array_elements(d->'clients') loop
 total=0;
 for m in select value from jsonb_array_elements(d->'moves') where value->>'clientId'=c->>'id' order by value->>'date',value->>'created',value->>'id' loop
 total=total+case when m->>'type'='credit' then (m->>'amount')::numeric else -(m->>'amount')::numeric end;
 if total<0 then raise exception 'El movimiento produciría saldo negativo en el historial'; end if;
 end loop;
 end loop;
end $$;

create function public.kj_write(b uuid, expected_version bigint, request_id uuid, action text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old jsonb; d jsonb; item jsonb; prev jsonb; v bigint; idx integer; result jsonb;
begin
 perform kristall_private.assert_access(b);
 if request_id is null then raise exception 'Falta identificador de solicitud'; end if;
 insert into kristall_private.ledgers(business_id) values(b) on conflict do nothing;
 select data,version into old,v from kristall_private.ledgers where business_id=b for update;
 if exists(select 1 from kristall_private.events e where e.business_id=b and e.request_id=kj_write.request_id and e.actor=auth.uid()) then
 return jsonb_build_object('version',v,'data',old); end if;
 if expected_version is distinct from v then raise exception 'Los datos cambiaron. Actualiza y revisa antes de guardar.' using errcode='40001'; end if;
 d=old;
 if action='client.create' then
 item=jsonb_build_object('id',(payload->>'id')::uuid,'name',payload->>'name','phone',coalesce(payload->>'phone',''),'identity',coalesce(payload->>'identity',''),'address',coalesce(payload->>'address',''),'notes',coalesce(payload->>'notes',''),'created',clock_timestamp());
 d=jsonb_set(d,'{clients}',(d->'clients')||jsonb_build_array(item));
 elsif action='client.update' then
 select ordinality::int-1,value into idx,prev from jsonb_array_elements(d->'clients') with ordinality where value->>'id'=payload->>'id';
 if idx is null then raise exception 'Cliente no encontrado'; end if;
 item=prev||jsonb_build_object('name',payload->>'name','phone',coalesce(payload->>'phone',''),'identity',coalesce(payload->>'identity',''),'address',coalesce(payload->>'address',''),'notes',coalesce(payload->>'notes',''));
 d=jsonb_set(d,array['clients',idx::text],item);
 elsif action='move.create' then
 item=payload - 'serial' - 'created' - 'revisions';
 item=item||jsonb_build_object('serial',jsonb_array_length(d->'moves')+1,'created',clock_timestamp(),'revisions','[]'::jsonb);
 d=jsonb_set(d,'{moves}',(d->'moves')||jsonb_build_array(item));
 elsif action='move.correct' then
 select ordinality::int-1,value into idx,prev from jsonb_array_elements(d->'moves') with ordinality where value->>'id'=payload->>'id';
 if idx is null then raise exception 'Movimiento no encontrado'; end if;
 if (prev->>'amount')::numeric is distinct from (payload->>'oldAmount')::numeric then raise exception 'El movimiento cambió'; end if;
 if length(trim(coalesce(payload->>'reason','')))=0 then raise exception 'Falta motivo'; end if;
 item=prev||jsonb_build_object('amount',payload->'amount','revisions',(prev->'revisions')||jsonb_build_array(jsonb_build_object('at',clock_timestamp(),'oldAmount',prev->'amount','newAmount',payload->'amount','reason',payload->>'reason','actor',auth.uid())));
 d=jsonb_set(d,array['moves',idx::text],item);
 elsif action='backup.restore' then
 -- Same-business, server-owned restore points only. No legacy data migration.
 select e.after_data into d from kristall_private.events e where e.business_id=b and e.id=(payload->>'backupId')::bigint;
 if d is null then raise exception 'Respaldo no encontrado'; end if;
 else raise exception 'Operación no permitida'; end if;
 perform kristall_private.validate(d);
 insert into kristall_private.events(business_id,request_id,actor,action,version,before_data,after_data) values(b,request_id,auth.uid(),action,v+1,old,d);
 update kristall_private.ledgers set data=d,version=v+1 where business_id=b;
 return jsonb_build_object('version',v+1,'data',d);
end $$;
create function public.kj_backups(b uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform kristall_private.assert_access(b);
 return coalesce((select jsonb_agg(x) from (select id,version,action,created_at from kristall_private.events where business_id=b order by id desc limit 50) x),'[]'::jsonb);
end $$;
create function kristall_private.assert_admin() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from kristall_private.admins where user_id=auth.uid()) or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'Se requiere administrador con verificación de dos pasos' using errcode='42501'; end if;
end $$;
create function public.kj_admin_list() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform kristall_private.assert_admin();
 return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'businessId',b.id,'name',b.display_name,'status',l.status,'paidThrough',l.paid_through,'priceCents',l.monthly_price_cents)) from public.licenses l join public.license_businesses b on b.id=l.business_id where b.product_id='joyerias'),'[]'::jsonb);
end $$;
create function public.kj_admin_license(license_id uuid, new_status text, through_date date, payment_cents integer, note text, admin_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare l public.licenses; today date=(now() at time zone 'America/Caracas')::date;
begin
 perform kristall_private.assert_admin();
 select x.* into l from public.licenses x join public.license_businesses b on b.id=x.business_id where x.id=license_id and b.product_id='joyerias' for update of x;
 if l.id is null then raise exception 'Licencia no encontrada'; end if;
 if admin_request is null then raise exception 'Falta identificador'; end if;
 if exists(select 1 from public.license_audit a where a.license_id=kj_admin_license.license_id and a.details->>'requestId'=admin_request::text) then return; end if;
 if new_status not in ('active','suspended','revoked','pending') or new_status is null or length(trim(coalesce(note,'')))=0 then raise exception 'Estado o motivo inválido'; end if;
 if new_status='active' and (through_date is null or through_date<today) then raise exception 'Fecha de vigencia inválida'; end if;
 if payment_cents is null or payment_cents<0 then raise exception 'Pago inválido'; end if;
 -- Explicit status action; renewal never silently reverses a revocation.
 update public.licenses set status=new_status,paid_through=through_date,revoked_at=case when new_status='revoked' then now() else null end,updated_at=now() where id=license_id;
 if payment_cents>0 then
 insert into public.license_payments(license_id,period_start,period_end,amount_cents,currency,note) values(license_id,today,through_date,payment_cents,'USD',note);
 end if;
 insert into public.license_audit(license_id,action,actor_uid,details) values(license_id,'manual.'||new_status,auth.uid(),jsonb_build_object('requestId',admin_request,'before',to_jsonb(l),'through',through_date,'paymentCents',payment_cents,'note',note));
end $$;
create function public.kj_admin_business(business_name text, business_slug text, user_email text) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid; b uuid; l uuid;
begin
 perform kristall_private.assert_admin();
 if length(trim(coalesce(business_name,'')))=0 or business_slug !~ '^[a-z0-9][a-z0-9-]{2,60}$' then raise exception 'Nombre o identificador inválido'; end if;
 select id into u from auth.users where lower(email)=lower(trim(user_email)) and email_confirmed_at is not null;
 if u is null then raise exception 'Primero se requiere una cuenta con correo confirmado'; end if;
 insert into public.license_businesses(product_id,slug,display_name) values('joyerias',business_slug,trim(business_name)) returning id into b;
 insert into public.licenses(business_id,monthly_price_cents,status) values(b,1500,'pending') returning id into l;
 insert into kristall_private.members(business_id,user_id) values(b,u);
 insert into public.license_audit(license_id,action,actor_uid,details) values(l,'business.create.pending',auth.uid(),jsonb_build_object('businessId',b,'memberId',u));
 return b;
end $$;
revoke all on function public.kj_admin_business(text,text,text) from public,anon;
grant execute on function public.kj_admin_business(text,text,text) to authenticated;
revoke all on all functions in schema kristall_private from public, anon, authenticated;
revoke all on function public.kj_account(),public.kj_read(uuid),public.kj_write(uuid,bigint,uuid,text,jsonb),public.kj_backups(uuid),public.kj_admin_list(),public.kj_admin_license(uuid,text,date,integer,text,uuid) from public, anon;
grant execute on function public.kj_account(),public.kj_read(uuid),public.kj_write(uuid,bigint,uuid,text,jsonb),public.kj_backups(uuid),public.kj_admin_list(),public.kj_admin_license(uuid,text,date,integer,text,uuid) to authenticated;
commit;
