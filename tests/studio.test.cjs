const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(){
  const els={};let canvasCount=0;
  function element(){return {value:'',hidden:false,style:{},textContent:'',innerHTML:'',children:[],classList:{add(){},remove(){}},addEventListener(){},setAttribute(){},checkValidity(){return true},reportValidity(){return true},replaceChildren(){this.children=[]},appendChild(e){this.children.push(e)},querySelector(){return element()},getContext(){const canvas=this;return {drawImage(){},fillRect(){},getImageData(){return {data:new Uint8Array(canvas.width*canvas.height*4)}}}},toBlob(cb,type,q){cb(new Blob([new Uint8Array(Math.ceil(this.width*this.height*(.1+q)))],{type}))}};}
  const context=vm.createContext({Blob,URL,setTimeout,console,document:{getElementById:id=>els[id]??=element(),createElement:()=>{canvasCount++;return element()}},window:{addEventListener(){}},createImageBitmap:async file=>{if(file.bad)throw Error();return {width:400,height:200,close(){}}},UPNG:{encode:(buffers,w,h,colors)=>new ArrayBuffer(Math.ceil(w*h*colors/256))},pako:{}});
  for(const [id,value] of Object.entries({format:'webp',quality:'82',crop:'none',background:'#ffffff'}))(els[id]??=element()).value=value;
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  return {context,els,run:code=>vm.runInContext(code,context)};
}
const defaults="{format:'webp',quality:'82',crop:'none',width:'',height:'',target:'',rename:'',suffix:'',background:'#ffffff'}";
test('center crop and fit preserve proportions and never enlarge',()=>{
  const {run}=setup();assert.equal(run(`geometry(400,200,{...${defaults},crop:'1',width:'100'}).width`),100);
  assert.equal(run(`geometry(400,200,{...${defaults},crop:'1',width:'100'}).sx`),100);
  assert.equal(run(`geometry(400,200,{...${defaults},width:'800'}).width`),400);
  assert.equal(run(`geometry(400,200,{...${defaults},height:'50'}).width`),100);
  assert.ok(run(`geometry(10000,10000,${defaults}).width**2`)<=24000000);
});
test('rename sanitizes paths and prevents case-insensitive collisions',()=>{
  const {run}=setup();run('var used=new Set()');
  assert.equal(run(`exportName({name:'Photo.png'},0,${defaults},used)`),'Photo.webp');
  assert.equal(run(`exportName({name:'photo.jpg'},1,${defaults},used)`),'photo (2).webp');
  assert.equal(run(`exportName({name:'a.png'},2,{...${defaults},format:'jpeg',rename:'product/test',suffix:'-small'},used)`),'product-test-003-small.jpg');
});
test('target size reduces dimensions when quality alone is insufficient',async()=>{
  const {run}=setup();const out=await run(`optimize(new Blob(['image'],{type:'image/jpeg'}),{...${defaults},target:'2'})`);
  assert.ok(out.blob.size<=2048);assert.ok(out.width<400);assert.equal(out.missed,false);
});
test('PNG retains smaller original only if dimensions are untouched',async()=>{
  const {run}=setup();run("var file=new Blob(['png'],{type:'image/png'})");
  assert.equal((await run(`optimize(file,{...${defaults},format:'png',quality:'256'})`)).keptOriginal,true);
  const resized=await run(`optimize(file,{...${defaults},format:'png',quality:'256',width:'100'})`);
  assert.equal(resized.keptOriginal,false);assert.equal(resized.width,100);
});
test('automatic batch exports continue after a bad input and unlock controls',async()=>{
  const {run,els}=setup();
  await run(`setFiles([{name:'broken.png',type:'image/png',bad:true},{name:'one.jpg',type:'image/jpeg',size:100000},{name:'one.png',type:'image/png',size:100000}])`);
  assert.equal(run('results.length'),2);assert.equal(run('results[1].name'),'one (2).webp');assert.equal(run('busy'),false);
  assert.equal(els.settings.disabled,false);assert.equal(els.zip.hidden,false);assert.match(els.summary.textContent,/1 failed/);
});
test('missing PNG library produces a useful error',async()=>{
  const {run}=setup();run('UPNG=undefined');await assert.rejects(run(`optimize(new Blob(['png'],{type:'image/png'}),{...${defaults},format:'png'})`),/PNG tools could not load/);
});
