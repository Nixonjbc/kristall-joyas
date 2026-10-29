-- Integration test on the actual project; ALL fixture rows are rolled back.
-- No persistent Auth users, sessions, businesses, licenses, members or financial data.
do $qa$
declare
 u uuid=gen_random_uuid(); u2 uuid=gen_random_uuid(); sid uuid=gen_random_uuid(); sid2 uuid=gen_random_uuid();
 b uuid=gen_random_uuid(); b2 uuid=gen_random_uuid(); c uuid=gen_random_uuid(); mid uuid=gen_random_uuid();
 lid uuid; rid uuid=gen_random_uuid(); v bigint=0; r jsonb; bs jsonb; report jsonb='[]'; blocked boolean;
begin
 begin
 insert into auth.users(id,email,email_confirmed_at) values(u,'rollback-a@example.invalid',now()),(u2,'rollback-b@example.invalid',now());
 insert into auth.sessions(id,user_id) values(sid,u),(sid2,u2);
 insert into public.license_businesses(id,product_id,slug,display_name) values(b,'joyerias','rollback-'||b,'QA rollback A'),(b2,'joyerias','rollback-'||b2,'QA rollback B');
 insert into public.licenses(business_id,status,monthly_price_cents,paid_through) values(b,'active',1500,current_date+2) returning id into lid;
 insert into public.licenses(business_id,status,monthly_price_cents) values(b2,'pending',1500);
 insert into kristall_private.members(business_id,user_id) values(b,u),(b2,u2);
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1','session_id',sid)::text,true);
 set local role authenticated;
 r=public.kj_account();
 if jsonb_array_length(r->'businesses')<>1 then raise exception 'Account isolation failed'; end if;
 report=report||'"account isolation"'::jsonb;
 r=public.kj_write(b,v,gen_random_uuid(),'client.create',jsonb_build_object('id',c,'name','Prueba reversible'));v=(r->>'version')::bigint;
 r=public.kj_write(b,v,rid,'move.create',jsonb_build_object('id',mid,'clientId',c,'type','credit','amount',100,'date','2026-10-26'));v=(r->>'version')::bigint;
 r=public.kj_write(b,v-1,rid,'move.create',jsonb_build_object('id',mid,'clientId',c,'type','credit','amount',100,'date','2026-10-26'));
 if jsonb_array_length(r->'data'->'moves')<>1 then raise exception 'Duplicate movement'; end if;
 report=report||'"atomic write and idempotency"'::jsonb;
 blocked=false;
 begin perform public.kj_write(b,v,gen_random_uuid(),'move.create',jsonb_build_object('id',gen_random_uuid(),'clientId',c,'type','payment','amount',101,'date','2026-10-26')); exception when others then if sqlerrm like '%saldo negativo%' then blocked=true; else raise; end if; end;
 if not blocked then raise exception 'Overpayment accepted'; end if;
 report=report||'"overpayment blocked"'::jsonb;
 blocked=false;
 begin perform public.kj_read(b2); exception when insufficient_privilege then blocked=true; end;
 if not blocked then raise exception 'Cross tenant access'; end if;
 report=report||'"cross-business access blocked"'::jsonb;
 r=public.kj_write(b,v,gen_random_uuid(),'move.correct',jsonb_build_object('id',mid,'oldAmount',100,'amount',90,'reason','Prueba reversible'));v=(r->>'version')::bigint;
 if jsonb_array_length(r->'data'->'moves'->0->'revisions')<>1 then raise exception 'Correction audit failed'; end if;
 report=report||'"audited correction"'::jsonb;
 bs=public.kj_backups(b);
 r=public.kj_write(b,v,gen_random_uuid(),'backup.restore',jsonb_build_object('backupId',bs->0->>'id'));v=(r->>'version')::bigint;
 report=report||'"server backup recovery"'::jsonb;
 blocked=false;
 begin perform 1 from kristall_private.ledgers; exception when insufficient_privilege then blocked=true; end;
 if not blocked then raise exception 'Direct table exposed'; end if;
 report=report||'"direct table access blocked"'::jsonb;
 reset role;
 insert into kristall_private.admins(user_id) values(u);
 set local role authenticated;
 blocked=false;
 begin perform public.kj_admin_list(); exception when insufficient_privilege then blocked=true; end;
 if not blocked then raise exception 'Admin without MFA'; end if;
 report=report||'"admin MFA required"'::jsonb;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal2','session_id',sid)::text,true);
 rid=gen_random_uuid();
 perform public.kj_admin_license(lid,'active',current_date+2,1500,'QA rollback',rid);
 perform public.kj_admin_license(lid,'active',current_date+2,1500,'QA rollback',rid);
 reset role;
 if (select count(*) from public.license_payments where license_id=lid)<>1 then raise exception 'Payment duplicated'; end if;
 set local role authenticated;
 report=report||'"manual renewal idempotency"'::jsonb;
 perform public.kj_admin_license(lid,'suspended',current_date+2,0,'QA rollback suspended',gen_random_uuid());
 blocked=false;
 begin perform public.kj_read(b); exception when insufficient_privilege then blocked=true; end;
 if not blocked then raise exception 'Suspended access allowed'; end if;
 report=report||'"suspension enforced"'::jsonb;
 reset role;
 delete from auth.sessions where id=sid;
 set local role authenticated;
 blocked=false;
 begin perform public.kj_account(); exception when insufficient_privilege then blocked=true; end;
 if not blocked then raise exception 'Logged out access allowed'; end if;
 report=report||'"session revocation enforced"'::jsonb;
 raise exception using errcode='ZX001',message='rollback all QA fixtures';
 exception when sqlstate 'ZX001' then null;
 end;
 -- The exception rolled back the entire inner block, including role and fixtures.
 if exists(select 1 from auth.users where id in(u,u2)) or exists(select 1 from public.license_businesses where id in(b,b2)) then raise exception 'QA fixtures not rolled back'; end if;
 perform set_config('kristall.qa_report',jsonb_build_object('passed',report,'fixturesRolledBack',true)::text,true);
end $qa$;
select current_setting('kristall.qa_report')::jsonb as integration_report;
