const $=id=>document.getElementById(id);
const controls=['format','quality','target','width','height','crop','background','rename','suffix'];
let selected=[],results=[],busy=false,queued=[],zipBusy=false;
const fmt=n=>n>=1048576?(n/1048576).toFixed(2)+' MB':n>=1024?(n/1024).toFixed(1)+' KB':n+' B';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
function cleanup(){results.forEach(r=>URL.revokeObjectURL(r.url));results=[];$('results').replaceChildren();$('zip').hidden=true;}
function qualityUI(reset=false){
  const png=$('format').value==='png';
  $('quality').min=png?2:10;$('quality').max=png?256:100;
  if(reset)$('quality').value=png?256:82;
  $('qualityLabel').innerHTML=(png?'PNG colors':'Quality')+' | <output id="qValue">'+$('quality').value+'</output>';
  $('qualityHint').textContent=png?'Fewer colors mean smaller files.':'Lower quality means smaller files.';
  $('preset').textContent=({webp:'WebP',png:'PNG',jpeg:'JPEG'})[$('format').value]+' | Auto';
}
$('format').onchange=()=>{qualityUI(true);settingsChanged();};
$('quality').oninput=()=>{$('qValue').textContent=$('quality').value;};
function settingsChanged(){if(selected.length&&!busy){$('apply').hidden=false;$('summary').textContent='Settings changed. Apply them to update your images.';}}
controls.forEach(id=>$(id).addEventListener('input',settingsChanged));
$('reset').onclick=()=>{
  $('format').value='webp';['target','width','height','rename','suffix'].forEach(id=>$(id).value='');
  $('crop').value='none';$('background').value='#ffffff';qualityUI(true);settingsChanged();
};
function settings(){
  if(!controls.every(id=>$(id).checkValidity())){
    $('options').open=true;$(controls.find(id=>!$(id).checkValidity())).reportValidity();return null;
  }
  return Object.fromEntries(controls.map(id=>[id,$(id).value]));
}
function safeName(value){return value.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').trim();}
function exportName(file,index,s,used){
  const base=safeName(s.rename)?safeName(s.rename)+'-'+String(index+1).padStart(3,'0'):safeName(file.name.replace(/\.[^.]+$/,''))||'image';
  const stem=base+safeName(s.suffix),ext=s.format==='jpeg'?'jpg':s.format;
  let name=stem+'.'+ext,count=2;
  while(used.has(name.toLowerCase()))name=stem+' ('+(count++)+').'+ext;
  used.add(name.toLowerCase());return name;
}
function geometry(w,h,s){
  let sw=w,sh=h;const ratio=Number(s.crop);
  if(s.crop!=='none'){if(w/h>ratio)sw=h*ratio;else sh=w/ratio;}
  const scale=Math.min(1,s.width?Number(s.width)/sw:1,s.height?Number(s.height)/sh:1,16384/sw,16384/sh,Math.sqrt(24000000/(sw*sh)));
  return {sx:(w-sw)/2,sy:(h-sh)/2,sw,sh,width:Math.max(1,Math.floor(sw*scale)),height:Math.max(1,Math.floor(sh*scale))};
}
async function encodeCanvas(canvas,s,setting){
  if(s.format==='png'){
    if(typeof UPNG==='undefined'||typeof pako==='undefined')throw new Error('PNG tools could not load. Connect to the internet and reload the page.');
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
    return new Blob([UPNG.encode([data.data.buffer],canvas.width,canvas.height,setting)],{type:'image/png'});
  }
  const type='image/'+s.format;
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob&&blob.type===type?resolve(blob):reject(new Error('This browser cannot export '+s.format.toUpperCase()+'. Try PNG or JPEG.')),type,setting/100));
}
async function optimize(file,s){
  let bitmap;
  try{bitmap=await createImageBitmap(file);}catch(e){throw new Error('Could not read this image. Its format may not be supported, or the file is damaged.');}
  const g=geometry(bitmap.width,bitmap.height,s),canvas=document.createElement('canvas');
  canvas.width=g.width;canvas.height=g.height;
  const ctx=canvas.getContext('2d');
  if(!ctx){bitmap.close();throw new Error('Image is too large for this browser.');}
  ctx.imageSmoothingQuality='high';
  if(s.format==='jpeg'){ctx.fillStyle=s.background;ctx.fillRect(0,0,canvas.width,canvas.height);}
  ctx.drawImage(bitmap,g.sx,g.sy,g.sw,g.sh,0,0,g.width,g.height);
  const unchanged=s.crop==='none'&&g.width===bitmap.width&&g.height===bitmap.height;
  bitmap.close();
  const target=s.target?Number(s.target)*1024:0;
  let blob=await encodeCanvas(canvas,s,+s.quality),best=blob;
  if(target&&best.size>target){
    // Search below the selected quality; retain the best candidate because PNG sizes can vary.
    let low=s.format==='png'?2:5,high=+s.quality;
    for(let i=0;i<6&&low<=high;i++){
      await pause();const mid=Math.floor((low+high)/2),candidate=await encodeCanvas(canvas,s,mid);
      if(candidate.size<=target){best=candidate;low=mid+1;}else{if(best.size>target&&candidate.size<best.size)best=candidate;high=mid-1;}
    }
    for(let i=0;i<10&&best.size>target&&(canvas.width>1||canvas.height>1);i++){
      await pause();const factor=Math.min(.85,Math.max(.2,Math.sqrt(target/best.size)*.85));
      const smaller=document.createElement('canvas');smaller.width=Math.max(1,Math.floor(canvas.width*factor));smaller.height=Math.max(1,Math.floor(canvas.height*factor));
      smaller.getContext('2d').drawImage(canvas,0,0,smaller.width,smaller.height);
      canvas.width=smaller.width;canvas.height=smaller.height;canvas.getContext('2d').drawImage(smaller,0,0);
      const candidate=await encodeCanvas(canvas,s,s.format==='png'?Math.min(64,+s.quality):Math.min(60,+s.quality));
      // This candidate has the current dimensions, so keep its matching size and blob together.
      best=candidate;
    }
  }
  let keptOriginal=false;
  if(unchanged&&canvas.width===g.width&&canvas.height===g.height&&s.format==='png'&&file.type==='image/png'&&file.size<=best.size){best=file;keptOriginal=true;}
  return {blob:best,width:canvas.width,height:canvas.height,missed:!!target&&best.size>target,keptOriginal};
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function lock(value){
  busy=value;$('settings').disabled=value;$('files').disabled=value;$('apply').disabled=value;$('clear').disabled=value;$('zip').disabled=value||zipBusy;
  $('drop').setAttribute('aria-busy',String(value));
}
async function process(){
  if(busy||!selected.length)return;
  const s=settings();if(!s){$('options').open=true;return;}
  cleanup();lock(true);$('apply').hidden=true;$('clear').hidden=false;$('progress').hidden=false;$('progress').max=selected.length;$('progress').value=0;
  const used=new Set();let oldTotal=0,newTotal=0,failed=0;
  try{
    for(let i=0;i<selected.length;i++){
      const file=selected[i],row=document.createElement('div');row.className='item';
      row.innerHTML='<div></div><div class="filename">'+esc(file.name)+'</div><span class="sizes">Working...</span>';$('results').appendChild(row);
      $('summary').textContent='Processing '+(i+1)+' of '+selected.length+' images...';await pause();
      try{
        const out=await optimize(file,s),name=exportName(file,i,s,used),url=URL.createObjectURL(out.blob);
        results.push({...out,name,url});oldTotal+=file.size;newTotal+=out.blob.size;
        const saving=Math.round((1-out.blob.size/file.size)*100);
        row.innerHTML='<img class="thumb" alt=""><div><div class="filename">'+esc(name)+'</div><div class="sizes">'+fmt(file.size)+' to '+fmt(out.blob.size)+' | '+out.width+' x '+out.height+' | '+(saving>=0?saving+'% smaller':Math.abs(saving)+'% larger')+'</div>'+(out.missed?'<div class="notice">Target not reached. Try smaller dimensions or a different format.</div>':'')+(out.keptOriginal?'<div class="sizes">Original PNG was already smaller.</div>':'')+'</div><button type="button">Download</button>';
        row.querySelector('img').src=url;row.querySelector('button').onclick=()=>download(out.blob,name);
      }catch(error){failed++;row.innerHTML='<div></div><div><div class="filename">'+esc(file.name)+'</div><div class="sizes error">'+esc(error.message)+'</div></div><span class="error">Failed</span>';}
      $('progress').value=i+1;
    }
    $('summary').textContent=results.length+' image'+(results.length===1?'':'s')+' ready'+(failed?' | '+failed+' failed':'')+(results.length?' | '+fmt(oldTotal)+' to '+fmt(newTotal):'')+'.';
    $('zip').hidden=results.length<2;
  }finally{lock(false);$('progress').hidden=true;}
  if(queued.length){const next=queued;queued=[];await setFiles(next);}
}
async function setFiles(files){
  const accepted=[...files].filter(f=>/^image\/(png|jpeg|webp|avif|gif|bmp|x-ms-bmp)$/.test(f.type)||/\.(png|jpe?g|webp|avif|gif|bmp)$/i.test(f.name));
  if(busy){queued.push(...accepted);$('summary').textContent='Processing images. '+queued.length+' more queued.';return;}
  if(!accepted.length){$('summary').textContent='Choose PNG, JPEG, WebP, AVIF, GIF or BMP images.';return;}
  selected=accepted;await process();
}
$('files').onchange=e=>{setFiles(e.target.files);e.target.value='';};
['dragenter','dragover'].forEach(event=>$('drop').addEventListener(event,e=>{e.preventDefault();$('drop').classList.add('drag');}));
['dragleave','drop'].forEach(event=>$('drop').addEventListener(event,e=>{e.preventDefault();$('drop').classList.remove('drag');}));
window.addEventListener('dragover',e=>e.preventDefault());
window.addEventListener('drop',e=>{
  e.preventDefault();$('drop').classList.remove('drag');
  if(e.dataTransfer&&e.dataTransfer.files.length)return setFiles(e.dataTransfer.files);
});
$('apply').onclick=process;
$('clear').onclick=()=>{if(busy)return;cleanup();selected=[];queued=[];$('files').value='';$('clear').hidden=true;$('apply').hidden=true;$('summary').textContent='';};
$('zip').onclick=async()=>{
  if(zipBusy||busy||!results.length)return;
  if(typeof JSZip==='undefined'){$('summary').textContent='ZIP tools could not load. Connect to the internet and reload, or download images individually.';return;}
  zipBusy=true;$('zip').disabled=true;$('zip').textContent='Creating ZIP...';
  try{const zip=new JSZip();results.forEach(r=>zip.file(r.name,r.blob));download(await zip.generateAsync({type:'blob',compression:'STORE'}),'image-studio.zip');}
  catch(error){$('summary').textContent='ZIP could not be created. Download images individually.';}
  finally{zipBusy=false;$('zip').disabled=busy;$('zip').textContent='Download all as ZIP';}
};
window.addEventListener('beforeunload',cleanup);
qualityUI();
