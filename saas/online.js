'use strict';
const online={session:null,business:null,version:0,busy:false,account:null,factor:null,uncertain:null,refreshing:null};
function clearPrivate(){db={version:2,clients:[],moves:[]};current=selected=editing=pendingCorrection=null;online.version=0;}
async function api(path,body,method='POST',authenticated=true){
 if(!navigator.onLine)throw Error('Sin conexión. Conéctate a internet para continuar.');
 const c=window.KRISTALL_CONFIG;
 if(!c?.publishableKey)throw Error('Entorno de pruebas pendiente de conectar a Supabase.');
 if(authenticated&&!online.session)throw Error('Inicia sesión para continuar.');
 if(authenticated&&online.session.expires_at<Date.now()+30000){
 if(!online.refreshing)online.refreshing=api('/auth/v1/token?grant_type=refresh_token',{refresh_token:online.session.refresh_token},'POST',false).then(setSession).finally(()=>online.refreshing=null);
 await online.refreshing;
 }
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
 const r=await fetch(c.url+path,{method,cache:'no-store',signal:controller.signal,headers:{apikey:c.publishableKey,'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+online.session.access_token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 let value;try{value=await r.json()}catch{const err=Error('Respuesta del servidor no válida.');err.uncertain=true;throw err;}
 if(!r.ok){const err=Error(value.message||value.msg||value.error_description||'No se pudo confirmar la operación.');err.uncertain=r.status>=500;throw err;}
 return value;
 }finally{clearTimeout(timer)}
}
function setSession(s){online.session={...s,expires_at:Date.now()+s.expires_in*1000};}
function rpc(name,args={}){return api('/rest/v1/rpc/'+name,args);}
function authScreen(message=''){
 clearPrivate();
 document.getElementById('app').innerHTML=`<div class="card" style="margin-top:50px"><h1>Kristall Joyas</h1><p>Plataforma online · Pruebas</p><p role="status">${esc(message)}</p><form onsubmit="loginOnline(event)"><div class="field"><label for="login-email">Correo</label><input id="login-email" name="email" type="email" autocomplete="username" required></div><div class="field"><label for="login-password">Contraseña</label><input id="login-password" name="password" type="password" autocomplete="current-password" required></div><button class="primary">Iniciar sesión</button></form><button type="button" class="secondary" onclick="signupScreen()">Crear mi cuenta</button><p class="hint">Acceso privado por negocio. La licencia se autoriza manualmente.</p></div>`;
}
async function loginOnline(e){e.preventDefault();if(online.busy)return;online.busy=true;const f=new FormData(e.target);try{setSession(await api('/auth/v1/token?grant_type=password',{email:f.get('email'),password:f.get('password')},'POST',false));await loadAccount()}catch(err){authScreen(err.message)}finally{online.busy=false}}
async function loadAccount(){
 if(online.uncertain){uncertainScreen();return;}
 clearPrivate();online.account=await rpc('kj_account');
 if(online.account.admin){await adminScreen();return;}
 const list=online.account.businesses;
 if(!list.length){authScreen('Esta cuenta aún no tiene un negocio autorizado.');return;}
 if(list.length===1){online.business=list[0];await refreshOnline();return;}
 document.getElementById('app').innerHTML='<h1>Seleccionar negocio</h1>'+list.map((b,i)=>`<button class="secondary" onclick="selectBusiness(${i})">${esc(b.name)}</button>`).join('');
}
async function selectBusiness(i){clearPrivate();online.business=online.account.businesses[i];await refreshOnline();}
async function refreshOnline(paint=true){try{
 const r=await rpc('kj_read',{b:online.business.id});db=r.data;online.version=r.version;if(paint)render();return true;
 }catch(e){clearPrivate();document.getElementById('app').innerHTML=`<div class="card"><h1>Acceso detenido</h1><p role="alert">${esc(e.message)}</p><button class="secondary" onclick="loadAccount().catch(e=>authScreen(e.message))">Reintentar</button><button class="secondary" onclick="logoutOnline()">Cerrar sesión</button></div>`;return false;}}
async function onlineWrite(action,payload){
 if(online.busy)return false;if(online.uncertain){kristallAlert('Hay una operación sin confirmar. Verifica su resultado antes de continuar.');return false;}online.busy=true;
 const command={b:online.business.id,expected_version:online.version,request_id:crypto.randomUUID(),action,payload};
 try{const r=await rpc('kj_write',command);db=r.data;online.version=r.version;return true;}
 catch(e){if(e.name==='AbortError'||e instanceof TypeError||e.uncertain===true){online.uncertain={rpc:'kj_write',params:command};uncertainScreen();}else{await refreshOnline(false);kristallAlert(e.message);}return false;}
 finally{online.busy=false;}
}
async function logoutOnline(){try{if(online.session)await api('/auth/v1/logout',{});}finally{online.session=null;online.business=null;online.account=null;authScreen('Sesión cerrada.')}}
async function startOnline(){
 // Separate /saas scope: never unregister the legacy application's worker or caches.
 authScreen(window.KRISTALL_CONFIG?.publishableKey?'':'Entorno pendiente de conectar a Supabase.');
}
window.addEventListener('offline',()=>{clearPrivate();authScreen('Sin conexión. Las operaciones están bloqueadas.');});
window.addEventListener('online',()=>{if(online.session)loadAccount().catch(e=>authScreen(e.message));else authScreen();});
// Revalidate on returning to the app. A suspended/expired license cannot use stale data.
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&online.session){clearPrivate();document.getElementById('app').textContent='Verificando acceso…';loadAccount().catch(e=>authScreen(e.message));}});
async function adminScreen(){
 try{const rows=await rpc('kj_admin_list');document.getElementById('app').innerHTML='<h1>Administración</h1><p>15 USD mensuales · Autorización manual</p><button class="secondary" onclick="businessForm()">Nueva joyería (pendiente)</button>'+rows.map((r,i)=>`<div class="card"><strong>${esc(r.name)}</strong><p>${esc(r.status)} · ${esc(r.paidThrough||'Sin vigencia')}</p><button class="secondary" onclick="licenseForm(${i})">Administrar licencia</button></div>`).join('')+'<button class="secondary" onclick="logoutOnline()">Cerrar sesión</button>';online.licenses=rows;
 }catch(e){await mfaScreen(e.message);}
}
async function mfaScreen(message){
 const user=await api('/auth/v1/user',undefined,'GET');const factor=user.factors?.find(f=>f.factor_type==='totp'&&f.status==='verified');online.factor=factor?.id;
 document.getElementById('app').innerHTML=`<div class="card"><h1>Verificación de dos pasos</h1><p>${esc(message)}</p>${factor?'<form onsubmit="verifyMfa(event)"><input name="code" inputmode="numeric" pattern="[0-9]{6}" required autocomplete="one-time-code" placeholder="Código de 6 dígitos"><button class="primary">Verificar</button></form>':'<p>Configura el autenticador para proteger la administración.</p><button class="primary" onclick="enrollMfa()">Configurar autenticador</button>'}<div id="mfa-enroll"></div><button class="secondary" onclick="logoutOnline()">Cerrar sesión</button></div>`;
}
async function enrollMfa(){try{const f=await api('/auth/v1/factors',{factor_type:'totp',friendly_name:'Kristall propietario'});online.factor=f.id;const box=document.getElementById('mfa-enroll');box.innerHTML='<p>Añade esta clave a tu autenticador:</p><code id="totp-secret"></code><form onsubmit="verifyMfa(event)"><input name="code" inputmode="numeric" pattern="[0-9]{6}" required autocomplete="one-time-code"><button class="primary">Confirmar</button></form>';document.getElementById('totp-secret').textContent=f.totp.secret;}catch(e){kristallAlert(e.message)}}
async function verifyMfa(e){e.preventDefault();try{const f=new FormData(e.target),challenge=await api('/auth/v1/factors/'+online.factor+'/challenge',{});const s=await api('/auth/v1/factors/'+online.factor+'/verify',{challenge_id:challenge.id,code:f.get('code')});setSession(s);await adminScreen()}catch(err){kristallAlert(err.message)}}
function licenseForm(i){online.license=online.licenses[i];online.licenseRequest=crypto.randomUUID();document.getElementById('app').innerHTML=`<h1>${esc(online.license.name)}</h1><div class="notice">No actives el primer cliente durante las pruebas.</div><form onsubmit="saveLicense(event)"><div class="field"><label>Estado</label><select name="status" required onchange="this.form.elements.amount.value=this.value==='active'?'15':'0'"><option value="">Seleccionar acción</option><option value="pending">Pendiente</option><option value="active">Autorizar / renovar</option><option value="suspended">Suspender</option><option value="revoked">Revocar</option></select></div><div class="field"><label>Vigente hasta</label><input name="through" type="date"></div><div class="field"><label>Pago confirmado (USD)</label><input name="amount" type="number" step="0.01" min="0" value="0" required></div><div class="field"><label>Motivo / referencia</label><textarea name="note" required></textarea></div><button class="primary">Revisar y confirmar</button></form><button class="secondary" onclick="adminScreen()">Volver</button>`;}
async function saveLicense(e){e.preventDefault();if(online.busy||online.uncertain)return;const f=new FormData(e.target);const message=`${online.license.name}: ${f.get('status')}, hasta ${f.get('through')||'sin fecha'}, pago $${f.get('amount')}.`;
 const params={license_id:online.license.id,new_status:f.get('status'),through_date:f.get('through')||null,payment_cents:Math.round(Number(f.get('amount'))*100),note:f.get('note'),admin_request:online.licenseRequest};
 kristallModal('Confirmar cambio manual',message,[{label:'Cancelar'},{label:'Confirmar',action:async()=>{if(online.busy)return;online.busy=true;try{await rpc('kj_admin_license',params);await adminScreen()}catch(err){if(err.name==='AbortError'||err instanceof TypeError||err.uncertain){online.uncertain={rpc:'kj_admin_license',params};uncertainScreen();}else kristallAlert(err.message)}finally{online.busy=false}}}]);}

function uncertainScreen(){document.getElementById('app').innerHTML='<div class="card"><h1>Confirmación pendiente</h1><p>No recibimos la respuesta del servidor. Las nuevas operaciones están detenidas para evitar duplicados.</p><button class="primary" onclick="resolveUncertain()">Verificar operación</button></div>';}
async function resolveUncertain(){if(online.busy||!online.uncertain)return;online.busy=true;try{const task=online.uncertain,r=await rpc(task.rpc,task.params);online.uncertain=null;if(task.rpc==='kj_write'){db=r.data;online.version=r.version;go('home');}else await adminScreen();kristallAlert('Operación confirmada. Revisa el historial.');}catch(e){if(e.name!=='AbortError'&&!(e instanceof TypeError)&&!e.uncertain){online.uncertain=null;await refreshOnline();kristallAlert(e.message);}else kristallAlert('Sigue sin recibirse confirmación. Reconecta y vuelve a verificar.');}finally{online.busy=false;}}

function businessForm(){document.getElementById('app').innerHTML='<h1>Nueva joyería</h1><p>La licencia se creará pendiente y los datos vacíos.</p><form onsubmit="createBusiness(event)"><div class="field"><label>Nombre</label><input name="name" required maxlength="120"></div><div class="field"><label>Identificador</label><input name="slug" pattern="[a-z0-9][a-z0-9-]{2,60}" required></div><div class="field"><label>Correo de la cuenta confirmada</label><input name="email" type="email" required></div><button class="primary">Crear con licencia pendiente</button></form><button class="secondary" onclick="adminScreen()">Volver</button>';}
async function createBusiness(e){e.preventDefault();if(online.busy)return;online.busy=true;try{const f=new FormData(e.target);await rpc('kj_admin_business',{business_name:f.get('name'),business_slug:f.get('slug'),user_email:f.get('email')});await adminScreen()}catch(err){kristallAlert(err.message)}finally{online.busy=false}}

function signupScreen(){clearPrivate();document.getElementById('app').innerHTML=`<div class="card" style="margin-top:30px"><h1>Crear mi cuenta</h1><p>La cuenta se creará sin acceso financiero. El propietario autoriza el negocio y la licencia por separado.</p><form onsubmit="signupOnline(event)"><div class="field"><label for="signup-email">Correo</label><input id="signup-email" name="email" type="email" autocomplete="username" required></div><div class="field"><label for="signup-password">Contraseña (mínimo 12 caracteres)</label><input id="signup-password" name="password" type="password" minlength="12" autocomplete="new-password" required></div><button class="primary">Crear cuenta y verificar correo</button></form><button class="secondary" onclick="authScreen()">Volver al inicio de sesión</button></div>`;}
async function signupOnline(e){e.preventDefault();if(online.busy)return;online.busy=true;try{const f=new FormData(e.target);await api('/auth/v1/signup?redirect_to='+encodeURIComponent(location.origin+'/?verified=1'),{email:f.get('email'),password:f.get('password')},'POST',false);authScreen('Revisa tu correo para confirmar la cuenta. Después vuelve aquí e inicia sesión. La cuenta no activa ninguna licencia.');}catch(err){kristallAlert(err.message)}finally{online.busy=false}}
