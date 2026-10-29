process.on('uncaughtException',e=>{console.error(e.message,e.detail||'',e.where||'');process.exit(1)});
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const pg=new PGlite();let count=0;
await pg.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'session_id',current_setting('request.jwt.claim.session_id',true))$$;
grant usage on schema auth to authenticated,anon; grant execute on all functions in schema auth to authenticated,anon;`);
await pg.exec(readFileSync('licensing/supabase/schema.sql','utf8').replace('create extension if not exists pgcrypto;',''));
await pg.exec("create function public.rls_auto_enable() returns void language sql as $$select$$;");
await pg.exec(readFileSync('supabase/migrations/202610260001_online.sql','utf8'));
const u='10000000-0000-4000-8000-000000000001',u2='10000000-0000-4000-8000-000000000002',b='20000000-0000-4000-8000-000000000001',b2='20000000-0000-4000-8000-000000000002',c='30000000-0000-4000-8000-000000000001',m='40000000-0000-4000-8000-000000000001';
await pg.query('insert into auth.users(id) values($1),($2)',[u,u2]);
await pg.query("insert into public.license_businesses(id,product_id,slug,display_name) values($1,'joyerias','test-a','Test A'),($2,'joyerias','test-b','Test B')",[b,b2]);
await pg.query("insert into public.licenses(business_id,status,monthly_price_cents,paid_through) values($1,'active',1500,current_date+30),($2,'pending',1500,null)",[b,b2]);
await pg.query('insert into kristall_private.members values($1,$2,true),($3,$4,true)',[b,u,b2,u2]);
await pg.query('insert into auth.sessions values($1,$1,null),($2,$2,null)',[u,u2]);
await pg.exec('set role authenticated');
async function user(id,aal='aal1'){await pg.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal',$2,false),set_config('request.jwt.claim.session_id',$1,false)",[id,aal]);}
async function ok(name,fn){await fn();count++;console.log('PASS',name)}
async function denied(sql,args,pattern){await assert.rejects(()=>pg.query(sql,args),pattern)}
let ver=0;async function write(action,payload,version=ver,request=crypto.randomUUID()){const r=await pg.query('select public.kj_write($1,$2,$3,$4,$5) r',[b,version,request,action,JSON.stringify(payload)]);ver=r.rows[0].r.version;return r.rows[0].r;}
await user(u);
await ok('direct table access denied',()=>denied('select * from kristall_private.ledgers',[],/permission denied/));
await ok('cross-business read denied',()=>denied('select public.kj_read($1)',[b2],/denegado/));
await ok('create client',async()=>{await write('client.create',{id:c,name:'Prueba'});assert.equal(ver,1)});
await ok('credit and server serial',async()=>{const r=await write('move.create',{id:m,clientId:c,type:'credit',amount:100,date:'2026-10-01',serial:999});assert.equal(r.data.moves[0].serial,1)});
await ok('overpayment rejected',()=>assert.rejects(()=>write('move.create',{id:crypto.randomUUID(),clientId:c,type:'payment',amount:101,date:'2026-10-02'}),/saldo negativo/));
await ok('historical negative balance rejected',()=>assert.rejects(()=>write('move.create',{id:crypto.randomUUID(),clientId:c,type:'payment',amount:1,date:'2026-09-30'}),/saldo negativo/));
await ok('fractional cents rejected',()=>assert.rejects(()=>write('move.create',{id:crypto.randomUUID(),clientId:c,type:'payment',amount:0.001,date:'2026-10-02'}),/Monto/));
await ok('stale update rejected',()=>assert.rejects(()=>write('client.update',{id:c,name:'Stale'},0),/cambiaron/));
await ok('valid payment',async()=>{await write('move.create',{id:crypto.randomUUID(),clientId:c,type:'payment',amount:40,date:'2026-10-02'})});
await ok('invalid correction rolls back',()=>assert.rejects(()=>write('move.correct',{id:m,oldAmount:100,amount:30,reason:'Prueba'}),/saldo negativo/));
await ok('correction audited',async()=>{const r=await write('move.correct',{id:m,oldAmount:100,amount:90,reason:'Prueba'});assert.equal(r.data.moves[0].revisions[0].actor,u)});
await ok('idempotent retry',async()=>{const req=crypto.randomUUID(),v=ver,p={id:crypto.randomUUID(),clientId:c,type:'credit',amount:10,date:'2026-10-03'};await write('move.create',p,v,req);const r=await write('move.create',p,v,req);assert.equal(r.data.moves.length,3)});
await user(u2);
await ok('pending license blocked',()=>denied('select public.kj_read($1)',[b2],/Licencia/));
await ok('cross-business write denied',()=>assert.rejects(()=>write('client.create',{id:crypto.randomUUID(),name:'Intruder'}),/denegado/));
await user('');
await ok('anonymous identity blocked',()=>denied('select public.kj_read($1)',[b],/Sesión/));
await user(u);
await ok('non-admin denied',()=>denied('select public.kj_admin_list()',[],/administrador/));
await pg.exec('reset role');await pg.query('insert into kristall_private.admins values($1)',[u]);await pg.exec('set role authenticated');await user(u);
await ok('admin without MFA blocked',()=>denied('select public.kj_admin_list()',[],/dos pasos/));
await user(u,'aal2');
await ok('admin MFA allowed',async()=>{const r=await pg.query('select public.kj_admin_list() r');assert.equal(r.rows[0].r.length,2)});
await ok('manual renewal is audited and idempotent',async()=>{
 const rows=(await pg.query('select public.kj_admin_list() r')).rows[0].r;const license=rows.find(x=>x.businessId===b);const req=crypto.randomUUID();
 for(let i=0;i<2;i++)await pg.query("select public.kj_admin_license($1,'active',current_date+30,1500,'Test renewal',$2)",[license.id,req]);
 await pg.exec('reset role');assert.equal((await pg.query('select count(*)::int n from public.license_payments where license_id=$1',[license.id])).rows[0].n,1);await pg.exec('set role authenticated');
});
await ok('server restore creates a new version',async()=>{
 const rows=(await pg.query('select public.kj_backups($1) r',[b])).rows[0].r;const target=rows.find(x=>x.version===2);const r=await write('backup.restore',{backupId:target.id});assert.equal(r.data.moves.length,1);assert.equal(r.data.moves[0].amount,100);
});
await ok('new business stays pending',async()=>{
 await pg.exec('reset role');await pg.query("update auth.users set email='test@example.test',email_confirmed_at=now() where id=$1",[u2]);await pg.exec('set role authenticated');
 const result=await pg.query("select public.kj_admin_business('Test C','test-c','test@example.test') b");await pg.exec('reset role');
 const row=(await pg.query('select status,monthly_price_cents from public.licenses where business_id=$1',[result.rows[0].b])).rows[0];assert.equal(row.status,'pending');assert.equal(row.monthly_price_cents,1500);await pg.exec('set role authenticated');
});
await ok('receipt serial never reused after restore',async()=>{const r=await write('move.create',{id:crypto.randomUUID(),clientId:c,type:'credit',amount:1,date:'2026-10-04'});assert.equal(r.data.moves.at(-1).serial,4)});
await ok('idempotency key cannot change payload',async()=>{const req=crypto.randomUUID(),v=ver,p={id:crypto.randomUUID(),name:'Idempotency'};await write('client.create',p,v,req);await assert.rejects(()=>write('client.create',{...p,name:'Changed'},v,req),/otros datos/)});
await ok('revoked session blocked immediately',async()=>{await pg.exec('reset role');await pg.query('delete from auth.sessions where id=$1',[u]);await pg.exec('set role authenticated');await denied('select public.kj_read($1)',[b],/Sesión/);await pg.exec('reset role');await pg.query('insert into auth.sessions values($1,$1,null)',[u]);await pg.exec('set role authenticated');});
await ok('backup restore is business-scoped',()=>assert.rejects(()=>write('backup.restore',{backupId:99999}),/no encontrado/));
await pg.exec('reset role');await pg.query("update public.licenses set status='suspended' where business_id=$1",[b]);await pg.exec('set role authenticated');await user(u);
await ok('suspension blocks read and writes',async()=>{await denied('select public.kj_read($1)',[b],/Licencia/);await assert.rejects(()=>write('client.create',{id:crypto.randomUUID(),name:'Blocked'}),/Licencia/)});
await pg.exec('reset role');await pg.query("update public.licenses set status='active',paid_through=current_date-1 where business_id=$1",[b]);await pg.exec('set role authenticated');
await ok('expired license blocked',()=>denied('select public.kj_read($1)',[b],/Licencia/));
await pg.close();console.log(`${count} database checks passed`);
