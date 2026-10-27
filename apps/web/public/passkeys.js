import { startAuthentication, startRegistration } from '/assets/webauthn/index.js';
const status=document.querySelector('[data-passkey-status]');
const message=(text)=>{if(status)status.textContent=text;};
const send=async(url,body)=>{
 const response=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data?.error?.message||'The passkey action could not be completed.');
 return data;
};
const safeError=(error)=>error?.name==='NotAllowedError'?'The passkey prompt was canceled or timed out.':error instanceof Error?error.message:'The passkey action could not be completed.';
const login=document.querySelector('[data-passkey-login]');
if(login){
 login.addEventListener('click',async()=>{
  login.disabled=true;message('Waiting for your passkey…');
  try{
   const csrf=login.dataset.csrf;
   const issued=await send('/api/v1/auth/passkeys/login/options',{csrf});
   const response=await startAuthentication({optionsJSON:issued.options});
   const result=await send('/api/v1/auth/passkeys/login/verify',{csrf,challengeId:issued.challengeId,response});
   window.location.assign(result.redirect||'/account');
  }catch(error){message(safeError(error));login.disabled=false;}
 });
}
const register=document.querySelector('[data-passkey-register]');
if(register){
 register.addEventListener('click',async()=>{
  register.disabled=true;message('Waiting for your passkey…');
  try{
   const csrf=register.dataset.csrf;
   const label=document.querySelector('[data-passkey-label]')?.value?.trim()||'This device';
   const issued=await send('/api/v1/auth/passkeys/registration/options',{csrf,label});
   const response=await startRegistration({optionsJSON:issued.options});
   await send('/api/v1/auth/passkeys/registration/verify',{csrf,challengeId:issued.challengeId,response,label});
   message('Passkey added.');window.location.reload();
  }catch(error){message(safeError(error));register.disabled=false;}
 });
}
for(const button of document.querySelectorAll('[data-passkey-revoke]')){
 button.addEventListener('click',async()=>{
  if(!window.confirm('Remove this passkey from your account?'))return;
  button.disabled=true;message('Removing passkey…');
  try{
   await send('/api/v1/me/passkeys/'+encodeURIComponent(button.dataset.passkeyRevoke),{csrf:button.dataset.csrf});
   message('Passkey removed.');window.location.reload();
  }catch(error){message(safeError(error));button.disabled=false;}
 });
}
