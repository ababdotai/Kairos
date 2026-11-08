import { renderPage } from '../share-page.js';
const status=document.querySelector('#status');
try {
  const id=new URL(location.href).searchParams.get('id');
  if(!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(id||''))throw new Error('Invalid share link / 分享链接无效');
  const configResponse=await fetch('../share-config.json',{cache:'no-store'});
  if(!configResponse.ok)throw new Error('Sharing service unavailable / 分享服务尚未配置');
  const config=await configResponse.json();
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url)||!config.key)throw new Error('Sharing service unavailable / 分享服务尚未配置');
  const response=await fetch(`${config.url}/rest/v1/rpc/read_share`,{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({share_id:id}),cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Could not load this page. Please retry. / 加载失败，请重试。');
  const page=await response.json();
  if(!page)throw new Error('This page is unavailable or was revoked. / 网页不存在或已被作者撤回。');
  const html=renderPage(page);
  document.title=page.title+' — Kairos';
  const frame=document.createElement('iframe');frame.title=page.title;frame.setAttribute('sandbox','allow-popups allow-popups-to-escape-sandbox');frame.srcdoc=html;
  status.replaceWith(frame);
}catch(error){status.textContent=error.message;}
