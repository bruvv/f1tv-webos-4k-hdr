'use strict';
/* Own catalog + video player. No navigation to F1's website. */
(function(){
const SERVICE='luna://com.bruvv.f1tv.service/';
const $=id=>document.getElementById(id);
let authenticated=false,currentPage='live',player=null,currentPlay=null,quality=-1,statsTimer=null,heartbeatTimer=null;
function notice(msg){$('notice').textContent=msg||'';$('notice').classList.toggle('hidden',!msg);}
function status(s){$('status').textContent=s;}
function call(method,params){
  return new Promise((resolve,reject)=>{
    const url=SERVICE+method;
    if(typeof WebOSServiceBridge!=='undefined'){
      const bridge=new WebOSServiceBridge();
      bridge.onservicecallback=raw=>{try{const r=JSON.parse(raw);if(r.returnValue===false)reject(new Error(r.errorText||r.errorMessage||'Service failed'));else resolve(r.result||{});}catch(e){reject(e);}};
      try{bridge.call(url,JSON.stringify(params||{}));}catch(e){reject(e);}return;
    }
    if(window.webOS?.service?.request){
      window.webOS.service.request('luna://com.bruvv.f1tv.service',{method,parameters:params||{},
        onSuccess:r=>r.returnValue===false?reject(new Error(r.errorText)):resolve(r.result||{}),
        onFailure:r=>reject(new Error(r.errorText||'Luna call failed'))});return;
    }
    reject(new Error('webOS Luna bridge unavailable; run inside an installed TV app'));
  });
}
function go(page){
  if(currentPage==='player'&&page!=='player')stopPlayback().catch(error=>notice(error.message));
  currentPage=page;
  Array.from(document.querySelectorAll('.page')).forEach(n=>n.classList.toggle('hidden',n.id!==page));
  Array.from(document.querySelectorAll('[data-route]')).forEach(n=>n.classList.toggle('active',n.dataset.route===page));
  notice('');
  if(page==='live'&&authenticated)load('live');
  if(page==='replay'&&authenticated)load('replay');
}
function clean(txt){return String(txt==null?'':txt);}
function cards(items,kind){
  const parent=$(kind==='live'?'liveList':'replayList');
  parent.replaceChildren();
  if(!items||!items.length){let n=document.createElement('div');n.className='placeholder';n.textContent='No sessions returned. Try again later.';parent.append(n);return;}
  for(const item of items){
    const tile=document.createElement('button');tile.className='tile';tile.type='button';
    const sub=document.createElement('small');sub.textContent=kind==='live'?'LIVE':'REPLAY';
    const title=document.createElement('strong');title.textContent=clean(item.title);
    const meta=document.createElement('span');meta.textContent=clean(item.type)+'  •  '+item.contentId;
    tile.append(sub,title,meta);
    tile.onclick=()=>startVideo(item);
    parent.append(tile);
  }
}
async function load(kind){
  const parent=$(kind==='live'?'liveList':'replayList');
  parent.textContent='Loading from F1 TV...';
  try{const x=await call('catalog',{kind});cards(x,kind);}
  catch(e){parent.textContent='';notice('Catalog: '+e.message);}
}
async function login(kind){
  notice('');status('Authenticating');
  try{
    const result=kind==='token'?await call('token',{token:$('token').value.trim()}):
      await call('login',{email:$('email').value.trim(),password:$('password').value});
    authenticated=true;$('password').value='';$('token').value='';
    status('Signed in  •  '+clean(result.entitlement));go('live');
  }catch(e){status('Not signed in');notice('Sign-in: '+e.message);}
}
function playerError(e){const msg=e?.detail?.message||e?.message||String(e);$('videoOverlay').classList.remove('hidden');$('videoOverlay').textContent='Playback error: '+msg;}
function updateStats(){
  const v=$('video');
  const track=player?.getVariantTracks().find(t=>t.active);
  const s=player?.getStats();
  const parts=[v.videoWidth&&v.videoHeight?`${v.videoWidth} × ${v.videoHeight} (video element)`:'Waiting for video'];
  if(track){
    parts.push((track.videoCodec||'Unknown codec')+' (manifest)');
    if(track.frameRate)parts.push(track.frameRate+' fps (manifest)');
    if(track.bandwidth)parts.push((track.bandwidth/1000000).toFixed(2)+' Mb/s (declared)');
    parts.push('HDR metadata: '+(track.hdr||'unknown'));
  }
  if(s&&Number.isFinite(s.decodedFrames))parts.push(s.decodedFrames+' decoded / '+s.droppedFrames+' dropped');
  parts.push('HDR output / hardware acceleration: unverified');
  $('stats').textContent=parts.join(' • ');
}
async function stopPlayback(){
  if(statsTimer){clearInterval(statsTimer);statsTimer=null;}
  if(heartbeatTimer){clearInterval(heartbeatTimer);heartbeatTimer=null;}
  const old=player;player=null;currentPlay=null;
  $('video').pause();
  if(old)await old.destroy();
  $('video').removeAttribute('src');$('video').load();
  await call('stop');
}
function changeLanguage(text){
  if(!player){notice('Language selection requires a DASH stream');return;}
  const choices=text?player.getTextLanguages():player.getAudioLanguages();
  if(!choices.length){notice('No '+(text?'subtitle':'audio')+' languages available');return;}
  const button=$(text?'subtitles':'audio');
  const index=(Number(button.dataset.index||-1)+1)%(choices.length+(text?1:0));
  button.dataset.index=index;
  if(text&&index===choices.length){player.setTextTrackVisibility(false);button.textContent='Subtitles: Off';return;}
  if(text){player.selectTextLanguage(choices[index]);player.setTextTrackVisibility(true);}
  else player.selectAudioLanguage(choices[index]);
  button.textContent=(text?'Subtitles: ':'Audio: ')+choices[index];
}
function mediaUri(uri,base){if(!uri||!/^https:\/\//i.test(uri))return uri;
  return base+encodeURIComponent(uri);
}
async function startVideo(item){
  go('player');$('playTitle').textContent=item.title||'F1 TV';$('streamType').textContent='Requesting an authorized stream';
  $('videoOverlay').textContent='Preparing playback...';$('videoOverlay').classList.remove('hidden');
  try{
    await stopPlayback();
    quality=-1;$('quality').textContent='Quality: Auto';
    for(const id of ['audio','subtitles'])delete $(id).dataset.index;
    const v=$('video');
    currentPlay=await call('play',{contentId:item.contentId,requestUhd:$('preferUhd').checked});
    heartbeatTimer=setInterval(()=>call('heartbeat').catch(error=>notice('Playback service: '+error.message)),15000);
    $('streamType').textContent=currentPlay.profile+'  •  '+(currentPlay.streamType||'Unknown stream')+(currentPlay.claimedUhd?'  •  UHD manifest selected (unverified playback)':'');
    if(currentPlay.isDash){
      if(typeof shaka==='undefined')throw new Error('Bundled Shaka Player library unavailable');
      shaka.polyfill.installAll();
      if(!shaka.Player.isBrowserSupported())throw new Error('EME/MSE playback not supported by this webOS build');
      player=new shaka.Player();await player.attach(v);
      player.addEventListener('error',playerError);
      player.configure({abr:{enabled:true,restrictions:{maxHeight:2160,maxWidth:3840}},
        streaming:{bufferingGoal:20,rebufferingGoal:3},
        drm:{servers:currentPlay.hasDrm?{'com.widevine.alpha':currentPlay.licenseProxy}:{}}});
      const net=player.getNetworkingEngine();
      net.registerRequestFilter((type,request)=>{
        if(type===shaka.net.NetworkingEngine.RequestType.LICENSE)return;
        request.uris=request.uris.map(u=>mediaUri(u,currentPlay.relayBase));
      });
      net.registerResponseFilter((_type,response)=>{
        if(response.uri&&response.uri.startsWith(currentPlay.relayBase)){
          try{const encoded=response.uri.substring(currentPlay.relayBase.length);response.uri=decodeURIComponent(encoded);}catch{}
        }
      });
      await player.load(currentPlay.manifestUrl);
    }else{
      // Native webOS HLS video path. 4K is not guaranteed.
      v.src=currentPlay.manifestUrl;await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Media did not load')),18000);
        v.addEventListener('loadedmetadata',()=>{clearTimeout(timer);resolve();},{once:true});
        v.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Native HLS playback failed'));},{once:true});
      });
    }
    await v.play();$('videoOverlay').classList.add('hidden');
    if(statsTimer)clearInterval(statsTimer);statsTimer=setInterval(updateStats,1000);updateStats();
  }catch(e){
    playerError(e);notice('Playback: '+e.message);
    stopPlayback().catch(error=>notice('Playback cleanup: '+error.message));
  }
}
function toggle(){const v=$('video');if(v.paused)v.play().catch(playerError);else v.pause();}
function seek(seconds){const v=$('video');if(Number.isFinite(v.duration))v.currentTime=Math.min(v.duration,Math.max(0,v.currentTime+seconds));}
function changeQuality(){
  if(!player){notice('Manual quality only works for DASH streams');return;}
  const tracks=player.getVariantTracks().filter(t=>t.height&&t.height<=2160).sort((a,b)=>a.height-b.height);
  if(!tracks.length){notice('No quality tracks available');return;}
  quality=(quality+1)%(tracks.length+1);
  if(quality===0){player.configure('abr.enabled',true);$('quality').textContent='Quality: Auto';return;}
  const t=tracks[quality-1];player.configure('abr.enabled',false);player.selectVariantTrack(t,true);
  $('quality').textContent='Quality: '+t.height+'p';
}
function remote(e){
  if(e.key==='Escape'||e.key==='Backspace'||e.keyCode===461){
    if(currentPage==='player'){e.preventDefault();go('live');return;}
  }
  if(currentPage==='player'&&e.target.tagName!=='INPUT'&&e.target.tagName!=='TEXTAREA'){
    if(e.key===' '||e.key==='MediaPlayPause'||e.keyCode===415||e.keyCode===19){e.preventDefault();toggle();}
    if(e.key==='ArrowLeft'&&document.activeElement.tagName!=='BUTTON'){e.preventDefault();seek(-10);}
    if(e.key==='ArrowRight'&&document.activeElement.tagName!=='BUTTON'){e.preventDefault();seek(10);}
  }
  if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.key))return;
  const els=Array.from(document.querySelectorAll('button:not(:disabled),input,textarea')).filter(el=>el.getBoundingClientRect().width&&el.getBoundingClientRect().height);
  const current=document.activeElement,from=current?.getBoundingClientRect();
  if(!from)return;
  const dir=e.key.slice(5).toLowerCase();let best=null,bestScore=Infinity;
  for(const x of els){if(x===current)continue;const r=x.getBoundingClientRect();const dx=r.x+r.width/2-from.x-from.width/2,dy=r.y+r.height/2-from.y-from.height/2;
    const along=dir==='right'?dx:dir==='left'?-dx:dir==='down'?dy:-dy;
    if(along<=0)continue;
    const lateral=dir==='right'||dir==='left'?Math.abs(dy):Math.abs(dx);
    const score=along+lateral*2;if(score<bestScore){best=x;bestScore=score;}
  }
  if(best){e.preventDefault();best.focus();}
}
async function boot(){
  for(const x of document.querySelectorAll('[data-route]'))x.onclick=()=>go(x.dataset.route);
  $('refreshLive').onclick=()=>authenticated?load('live'):go('settings');
  $('refreshReplay').onclick=()=>authenticated?load('replay'):go('settings');
  $('signIn').onclick=()=>login('password');$('useToken').onclick=()=>login('token');
  $('signOut').onclick=async()=>{
    try{await stopPlayback();await call('logout');authenticated=false;status('Signed out');go('settings');}
    catch(error){notice('Sign-out failed: '+error.message);}
  };
  $('back').onclick=()=>go('live');
  $('togglePlayback').onclick=toggle;$('rewind').onclick=()=>seek(-10);$('forward').onclick=()=>seek(10);
  $('quality').onclick=changeQuality;
  $('audio').onclick=()=>changeLanguage(false);$('subtitles').onclick=()=>changeLanguage(true);
  $('probe').onclick=async()=>{
    $('capabilities').textContent='Checking MSE and Widevine declarations...';
    try{const report=await playbackCapabilities(window);
      $('capabilities').textContent=JSON.stringify(report,null,2);
      console.info('[F1TV capabilities]',JSON.stringify(report));
    }catch(error){$('capabilities').textContent='Capability check failed: '+error.message;}
  };
  document.addEventListener('keydown',remote);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&currentPage==='player')go('live');});
  try{const r=await call('status');if(r.serverError)throw new Error('Local media relay: '+r.serverError);
    authenticated=!!r.authenticated;status(authenticated?'Connected':'Sign-in required');
    if(authenticated)load('live');else go('settings');
  }catch(e){status('Service unavailable');notice(e.message+'  •  Check JS service packaging.');go('settings');notice(e.message+'  •  Check JS service packaging.');}
}
boot();
})();
