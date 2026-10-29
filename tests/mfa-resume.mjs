import vm from 'node:vm';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const app={innerHTML:''};const ctx=vm.createContext({console,window:{addEventListener(){}},document:{addEventListener(){},getElementById(){return app}}});
vm.runInContext(readFileSync('saas/online.js','utf8'),ctx);
vm.runInContext("function esc(s){return String(s||'')}let requests=[];let factorStatus='unverified';api=async(path,body,method)=>{requests.push({path,method});return {factors:[{id:'existing-totp',factor_type:'totp',status:factorStatus}]}};function kristallAlert(message){throw Error(message)}",ctx);
await vm.runInContext("mfaScreen('Reanudar')",ctx);
assert.equal(vm.runInContext('online.factor',ctx),'existing-totp');assert.match(app.innerHTML,/verifyMfa/);assert.doesNotMatch(app.innerHTML,/onclick="enrollMfa/);console.log('PASS pending factor resumes verification after app switch');
await vm.runInContext('enrollMfa()',ctx);assert.equal(vm.runInContext("requests.filter(r=>r.path==='/auth/v1/factors').length",ctx),0);console.log('PASS existing factor is never enrolled again');
vm.runInContext("factorStatus='verified'",ctx);await vm.runInContext("mfaScreen('Verificar')",ctx);assert.match(app.innerHTML,/verifyMfa/);console.log('PASS verified factor keeps normal challenge flow');
