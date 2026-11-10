'use strict';
/* F1 TV API and media relay. Unofficial; no DRM circumvention or key extraction. */
const Service = require('webos-service');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const relayPolicy = require('./relay-policy');
const {parseSubscriptionToken, loginWithPassword} = require('./auth');
const service = new Service('com.bruvv.f1tv.service');
const SessionLease = require('./session-lease');
const sessionLease = new SessionLease(service.activityManager);
const BASE = 'https://f1tv.formula1.com';
const PORT = 38791;
const userAgent = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/132.0.0.0 Safari/537.36';
const state = {token: null, entitlementToken: null, location: null, play: null,
  session: crypto.randomBytes(20).toString('hex'), allowedHosts: new Set(), serverError: null};

function request(url, opts) {
  opts = opts || {};
  let parsed;
  try { parsed = new URL(url); }
  catch(error) { return Promise.reject(error); }
  if (parsed.protocol !== 'https:') return Promise.reject(new Error('HTTPS required'));
  return new Promise((resolve, reject) => {
    const req = https.request(parsed, {method:opts.method||'GET',headers: Object.assign({
      'User-Agent':userAgent,'Accept':'application/json, */*','Accept-Language':'en-US,en;q=0.9'
    },opts.headers||{}),timeout:18000}, res => {
      res.on('error',reject);
      res.on('aborted',()=>reject(new Error('Response interrupted')));
      let bufs=[],length=0;
      res.on('data', b=>{length+=b.length;if(length>5*1024*1024){req.destroy(new Error('Response too large'));return;}bufs.push(b);});
      res.on('end',()=>{let body=Buffer.concat(bufs);resolve({status:res.statusCode,headers:res.headers,body,
        text:body.toString('utf8')});});
    });
    req.on('timeout',()=>req.destroy(new Error('Request timeout')));
    req.on('error',reject);
    if(opts.body) req.write(opts.body);
    req.end();
  });
}
function isF1Host(url) {
  try { const h = new URL(url).hostname; return h==='formula1.com'||h.endsWith('.formula1.com'); }
  catch { return false; }
}
async function jsonRequest(url,opts){
  if(!isF1Host(url))throw new Error('API origin rejected');
  const r=await request(url,opts); let obj;
  try{obj=JSON.parse(r.text);}catch{throw new Error('F1 TV returned non-JSON HTTP '+r.status);}
  if(r.status<200||r.status>=300)throw new Error((obj.message||obj.error||'F1 TV HTTP '+r.status).toString().slice(0,240));
  if(obj.resultCode && obj.resultCode!=='OK')throw new Error((obj.message||obj.resultObj?.message||obj.resultCode).toString().slice(0,240));
  return obj;
}
const platform='WEB_DASH',lang='ENG';
function path(version,action,profile){return BASE+'/'+version+'/'+(state.token?'R':'A')+'/'+lang+'/'+(profile||platform)+'/ALL/'+action;}
function authHeaders(){const h={};if(state.token)h.ascendontoken=state.token;if(state.entitlementToken)h.entitlementtoken=state.entitlementToken;return h;}
async function init(token){
  token=parseSubscriptionToken(token);
  sessionLease.release();
  state.session=crypto.randomBytes(20).toString('hex');
  state.allowedHosts.clear();
  state.token=token;state.entitlementToken=null;state.location=null;state.play=null;
  try {
  const ent=await jsonRequest(path('2.0','USER/ENTITLEMENT'),{headers:{ascendontoken:token}});
  state.entitlementToken=ent.resultObj?.entitlementToken;
  if(!state.entitlementToken)throw new Error('F1 did not return an entitlement token');
  const loc=await jsonRequest(path('1.0','USER/LOCATION'),{headers:authHeaders()});
  state.location=loc.resultObj?.userLocation?.[0];
  if(!state.location)throw new Error('F1 did not return region/entitlement information');
  await sessionLease.acquire();
  return {authenticated:true,region:state.location.countryCode||state.location.country||'Unknown',
    entitlement:state.location.entitlement||'Unknown'};
  } catch(error) {
    sessionLease.release();
    state.token=null;state.entitlementToken=null;state.location=null;state.play=null;
    if(/AscendonToken.*(signature|expired)/i.test(error.message))throw new Error('F1 rejected the subscriptionToken signature or expiry. A fresh challenge/access/entitlement token is not necessarily the account subscriptionToken. Import the account login response and check the TV clock.');
    throw error;
  }
}
function locParts(){if(!state.location)throw new Error('Sign in first');return [state.location.entitlement||'F1_TV_Pro_Annual',state.location.groupId||2].map(String);}
async function signIn(email,password){
  return init(await loginWithPassword(email,password,request));
}
function flatten(items){return (items||[]).map(item=>{const m=item.metadata||{};return {
  id:String(m.contentId||item.id||''),title:m.title||item.title||item.uiMetadata?.mainTitle||'F1 TV',
  type:m.contentSubtype||m.emfAttributes?.VideoType||'',description:m.description||'',
  videoType:m.emfAttributes?.VideoType||'',series:m.emfAttributes?.Series||'',
  contentId:Number(m.contentId||item.id||0), image:m.pictureUrl||m.imageUrl||''
};}).filter(x=>Number.isFinite(x.contentId)&&x.contentId>0);}
async function catalog(kind){
  const [ent,group]=locParts();
  if(kind==='live'){
    const r=await jsonRequest(path('1.0','EVENTS/LIVENOW/'+ent+'/'+group),{headers:authHeaders()});
    return flatten(r.resultObj?.items);
  }
  // shortcut: latest-race scans 100 recent results; use archive pagination if no race is returned.
  const query=new URLSearchParams({maxResults:kind==='latest-race'?'100':'30',orderBy:'startDate',sortOrder:'desc'});
  const r=await jsonRequest(path('2.0','PAGE/SEARCH/VOD/'+ent+'/'+group)+'?'+query,{headers:authHeaders()});
  const items=flatten(r.resultObj?.containers);
  if(kind!=='latest-race')return items;
  const race=items.find(item=>/^REPLAY$/i.test(item.type)&&
    (!item.videoType||/^meetingSession$/i.test(item.videoType))&&
    (!item.series||/^(F1|FORMULA\s*1)$/i.test(item.series))&&
    /\b(race|grand prix)\b/i.test(item.title)&&
    !/\b(practice|qualifying|sprint|highlights?|recap|review|preview|show|onboard|kids|f2|f3|formula\s*[23]|academy|porsche|supercup)\b|race\s+in\s+\d/i.test(item.title));
  return race?[race]:[];
}
function extractPaToken(manifest){
  try{const m=/\/pa_([^/?#]+)/.exec(manifest);if(!m)return null;
    const v=m[1].replace(/-/g,'+').replace(/_/g,'/');
    const decoded=Buffer.from(v,'base64').toString('latin1');
    const part=decoded.split('|').find(x=>x.startsWith('token:'));
    return part?part.slice(6):null;
  }catch{return null;}
}
async function getPlay(contentId,channelId,requestUhd){
  if(!state.token||!state.entitlementToken)throw new Error('Sign in first');
  if(!/^\d+$/.test(String(contentId)))throw new Error('Invalid content id');
  const query=new URLSearchParams({contentId:String(contentId)});
  if(channelId!=null&&/^\d+$/.test(String(channelId)))query.set('channelId',String(channelId));
  // Headers reproduced from public field reports, not an assertion of supported F1 clients.
  const androidFull='device=android_tv;screen=bigscreen;os=android;model=webos;osVersion=34;appVersion=30410001;playerVersion=3.112.0;p=true;u=false;';
  const tests=requestUhd ? [
    {version:'3.0',platform:'WEB_DASH',device:'device=android_tv'},
    {version:'3.0',platform:'BIG_SCREEN_DASH',device:androidFull},
    {version:'2.0',platform:'WEB_DASH',device:'device=android_tv'},
    {version:'2.0',platform:'BIG_SCREEN_DASH',device:androidFull},
    {version:'3.0',platform:'WEB_HLS',device:'device=tvos'},
    {version:'2.0',platform:'WEB_HLS',device:null}
  ] : [
    {version:'2.0',platform:'WEB_DASH',device:null},
    {version:'2.0',platform:'BIG_SCREEN_DASH',device:null},
    {version:'2.0',platform:'WEB_HLS',device:null}
  ];
  let lastError, best=null;
  for(const t of tests){
    try{
      const headers=authHeaders();
      if(t.device)headers['x-f1-device-info']=t.device;
      const obj=(await jsonRequest(path(t.version,'CONTENT/PLAY',t.platform)+'?'+query,{headers})).resultObj;
      if(!obj?.url)continue;
      const isDash=/\.mpd(\?|$)/i.test(obj.url)||/DASH/i.test(obj.streamType||t.platform);
      const candidate={obj,t,isDash};
      if(!best||(isDash&&!best.isDash))best=candidate;
      // The declared stream type is not proof that it will decode, just that the
      // service selected a corresponding manifest.
      if(/UHD/i.test(obj.streamType||'')&&isDash){best=candidate;break;}
    }catch(e){lastError=e;}
  }
  if(!best)throw lastError||new Error('F1 TV returned no playable stream');
  const {obj,t,isDash}=best;
  let licenseUrl=obj.laURL||obj.laUrl||'';
  if(!licenseUrl&&isDash)licenseUrl=path('2.0','CONTENT/LA/widevine',t.platform)+'?'+query;
  let host;
  try {
    host=new URL(obj.url).hostname;
    relayPolicy.authorize(obj.url,new Set([host]));
  }catch(error){throw new Error('Invalid playback URL: '+error.message);}
  state.allowedHosts=new Set([host]);
  state.session=crypto.randomBytes(20).toString('hex');
  const playToken=extractPaToken(obj.url);
  state.play={url:obj.url,licenseUrl,playToken,drmToken:obj.drmToken||'',profile:t.platform,
    streamType:obj.streamType||'',contentId:String(contentId)};
  await sessionLease.acquire();
  return {manifestUrl:obj.url,profile:t.platform,streamType:obj.streamType||'',
    apiVersion:t.version,claimedUhd:/UHD/i.test(obj.streamType||''),
    isDash,hasDrm:!!licenseUrl,licenseProxy:'http://127.0.0.1:'+PORT+'/license?s='+state.session,
    relayBase:'http://127.0.0.1:'+PORT+'/media?s='+state.session+'&url=',
    session:state.session};
}
function cors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,HEAD,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Range,Content-Type,Accept');res.setHeader('Access-Control-Expose-Headers','Content-Length,Content-Range,Accept-Ranges,Content-Type');}
function proxy(req,res,url,extraHeaders,redirects,credentialOrigin){
  if((redirects||0)>3){res.writeHead(502);res.end('Too many redirects');return;}
  let u;
  try { u=relayPolicy.authorize(url,state.allowedHosts,credentialOrigin); }
  catch{res.writeHead(403);res.end('Upstream origin rejected');return;}
  const h=Object.assign({'User-Agent':userAgent,'Accept':'*/*',Origin:'https://f1tv.formula1.com',Referer:'https://f1tv.formula1.com/'},extraHeaders||{});
  if(req.headers.range)h.Range=req.headers.range;
  const upstream=https.request(u,{method:req.method,headers:h,timeout:20000},up=>{
    if([301,302,303,307,308].includes(up.statusCode)&&up.headers.location){
      let dest;
      try { dest=relayPolicy.redirect(up.headers.location,url,state.allowedHosts,credentialOrigin); }
      catch{res.writeHead(403);res.end('Redirect origin rejected');up.resume();return;}
      up.resume();proxy(req,res,dest.toString(),extraHeaders,(redirects||0)+1,credentialOrigin);return;
    }
    res.statusCode=up.statusCode;
    for(const k of ['content-type','content-length','content-range','accept-ranges','cache-control']){
      if(up.headers[k])res.setHeader(k,up.headers[k]);
    }
    if(!credentialOrigin && req.method==='GET' && url===state.play?.url){
      const cookies=up.headers['set-cookie']||[];
      for(const cookie of cookies){
        const match=/^playToken=([^;\r\n]+)/i.exec(cookie);
        if(match)state.play.playToken=match[1];
      }
    }
    up.on('error',()=>res.destroy());
    up.pipe(res);
  });
  upstream.on('timeout',()=>upstream.destroy(new Error('Timeout')));
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Upstream error');});
  req.on('aborted',()=>upstream.destroy());
  if(req.method==='POST')req.pipe(upstream);else upstream.end();
}
const server=http.createServer((req,res)=>{
  cors(res);
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  const u=new URL(req.url,'http://127.0.0.1:'+PORT);
  if(u.searchParams.get('s')!==state.session||!state.token||!state.play){res.writeHead(403);res.end('Session not authorized');return;}
  if(u.pathname==='/media'&&(req.method==='GET'||req.method==='HEAD')){
    try{const target=u.searchParams.get('url');if(!target)throw new Error('Missing media URL');
      proxy(req,res,target,{},0);
    }catch{res.writeHead(400);res.end('Invalid media URL');}return;
  }
  if(u.pathname==='/license'&&req.method==='POST'){
    if(!state.play.licenseUrl){res.writeHead(400);res.end('License URL unavailable');return;}
    const headers=Object.assign(authHeaders(),{'Content-Type':'application/octet-stream'});
    if(state.play.drmToken){headers.drmtoken=state.play.drmToken;headers.Authorization='Bearer '+state.play.drmToken;}
    if(state.play.playToken)headers.Cookie='playToken='+state.play.playToken;
    try {
      const origin=new URL(state.play.licenseUrl).origin;
      if(!isF1Host(state.play.licenseUrl))throw new Error('Untrusted license issuer');
      proxy(req,res,state.play.licenseUrl,headers,0,origin);
    }catch{res.writeHead(403);res.end('License origin rejected');}return;
  }
  res.writeHead(404);res.end();
});
server.on('error',e=>{state.serverError=e.message;console.error('[F1TV relay]',e.message);});
server.listen(PORT,'127.0.0.1');

function register(name,fn){service.register(name, message=>{
  Promise.resolve().then(()=>fn(message.payload||{})).then(result=>message.respond({returnValue:true,result:result||{}}))
    .catch(err=>message.respond({returnValue:false,errorText:err.message||'Unknown error'}));
});}
register('status',()=>({serverError:state.serverError,authenticated:!!state.entitlementToken,port:PORT}));
register('heartbeat',async()=>{
  const authenticated=!!(state.entitlementToken&&state.location);
  if(authenticated)await sessionLease.acquire();
  return {authenticated,active:!!state.play};
});
register('suspend',()=>{sessionLease.release();return {suspended:true};});
register('stop',()=>{state.play=null;state.allowedHosts.clear();return {stopped:true};});
register('login',({email,password})=>signIn(email,password));
register('token',({token})=>init(token));
register('catalog',({kind})=>catalog(kind));
register('play',({contentId,channelId,requestUhd})=>getPlay(contentId,channelId,!!requestUhd));
register('logout',()=>{sessionLease.release();state.session=crypto.randomBytes(20).toString('hex');state.token=null;state.entitlementToken=null;state.location=null;state.play=null;state.allowedHosts.clear();return {authenticated:false};});
console.log('[F1TV] service registered');
