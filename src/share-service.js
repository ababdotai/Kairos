const CONFIG_URL = 'https://www.abab.ai/kairos/share-config.json';
export async function connectShareService() {
  const response = await fetch(CONFIG_URL, {cache:'no-store',signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Publishing is not configured yet');
  const config = await response.json();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url) || typeof config.key !== 'string' || !config.key) throw new Error('Publishing is not configured yet');
  const sessionKey = `share-session:${config.url}`;
  let session = (await chrome.storage.session.get(sessionKey))[sessionKey];
  const request = async (path, body, auth = false) => {
    if (auth && (!session || session.expiresAt < Date.now())) throw new Error('Sign in to publish');
    const r = await fetch(config.url + path, {method:'POST', headers:{'Content-Type':'application/json',apikey:config.key,...(auth?{Authorization:`Bearer ${session.token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    const data = await r.json().catch(()=>null);
    if (!r.ok) { if (r.status===401) { session=null; await chrome.storage.session.remove(sessionKey); } throw new Error(data?.msg || data?.message || 'Publishing request failed'); }
    return data;
  };
  return {
    signedIn:()=>!!session && session.expiresAt>Date.now(),
    sendCode:email=>request('/auth/v1/otp',{email,create_user:true}),
    verify:async(email,token)=>{const data=await request('/auth/v1/verify',{email,token,type:'email'});if(!data?.access_token)throw new Error('Sign in failed');session={token:data.access_token,expiresAt:Date.now()+data.expires_in*1000};await chrome.storage.session.set({[sessionKey]:session});},
    publish:(id,doc)=>request('/rest/v1/rpc/publish_share',{share_id:id,document:doc},true),
    revoke:id=>request('/rest/v1/rpc/revoke_share',{share_id:id},true),
    list:()=>request('/rest/v1/rpc/list_my_shares',{},true),
    signOut:async()=>{session=null;await chrome.storage.session.remove(sessionKey);}
  };
}
