// Optional development dependency: npm install --no-save jsdom
// Tests real editor handlers and locale updates; no paid AI or personal media.
const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..');
function setup() {
 const dom=new JSDOM(fs.readFileSync(path.join(root,'static/index.html'),'utf8'),{url:'http://localhost/',runScripts:'outside-only'});
 const w=dom.window;w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};w.HTMLMediaElement.prototype.play=async function(){};
 w.fetch=async url=>({ok:true,json:async()=>url==='/api/capabilities'?{user:{id:'editor1',username:'editor1',role:'editor'},ai_available:false}:url.startsWith('/api/projects')?{projects:[]}:url.includes('search')?{results:[]}:{media:[]}});
 for(const name of ['ui-catalog.js','ui.js','timing.js','app.js'])w.eval(fs.readFileSync(path.join(root,'static',name),'utf8'));
 return dom;
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const dom=setup(),w=dom.window,d=w.document;await tick();
 const switchTo=(id,value)=>{d.getElementById(id).value=value;d.getElementById(id).dispatchEvent(new w.Event('change'));};
 const project={id:'b'.repeat(32),name:'Save timeline',song_id:'a'.repeat(32),song_name:'Save timeline',clip_ids:['a'.repeat(32)],clip_durations:{['a'.repeat(32)]:10},shots:[{media_id:'a'.repeat(32),name:'Save timeline',reason:'Original',source_start:0,duration:1},{media_id:'a'.repeat(32),name:'Refresh',source_start:1,duration:1}],duration:2,selection_mode:'speech',source_audio:true,transcripts:{['a'.repeat(32)]:[{word:'Save timeline',start:0,end:1},{word:'抢救',start:1,end:2}]},transcript_keep:[0],captions:[{start:0,end:1,text:'Save timeline 抢救'}]};
 w.eval(`installProject(${JSON.stringify(project)})`);await tick();
 const video=d.getElementById('preview'),song=d.getElementById('song');
 d.getElementById('project-name').value='Your timeline starts here';d.getElementById('project-name').dispatchEvent(new w.Event('input'));
 switchTo('ui-language','zh-hans');await tick();assert.equal(d.getElementById('project-title').textContent,'Your timeline starts here');
 switchTo('ui-language','en');await tick();
 d.getElementById('project-name').value='未保存的名字';d.getElementById('project-name').dispatchEvent(new w.Event('input'));
 const caption=d.querySelector('#caption-editor textarea');caption.value='修正 Save timeline';
 switchTo('ui-language','zh-hans');await tick();
 assert.equal(d.getElementById('save').textContent,'保存时间线');assert.equal(d.getElementById('project-save-state').textContent,'有未保存的修改');
 assert.equal(d.getElementById('project-title').textContent,'未保存的名字');assert.equal(d.querySelector('.shot-name').textContent,'Save timeline');
 assert.equal(caption.value,'修正 Save timeline');assert.equal(d.getElementById('caption-language').value,'original');
 assert(!d.querySelectorAll('#transcript-words input')[1].checked);
 switchTo('ui-layout','classic');switchTo('ui-language','zh-hant');await tick();
 assert.equal(d.getElementById('save').textContent,'保存時間線');assert(d.querySelector('.music-options').open);
 assert.strictEqual(d.getElementById('preview'),video);assert.strictEqual(d.getElementById('song'),song);
 assert.equal(d.getElementById('project-name').value,'未保存的名字');assert.equal(caption.value,'修正 Save timeline');
 // A real editor handler creates new UI nodes after the locale has changed.
 d.querySelector('.shot-actions button').click();await tick();assert(d.getElementById('now-playing').textContent.startsWith('鏡頭 1'));
 switchTo('ui-layout','clean');d.querySelector('[data-panel="media"]').click();assert.equal(d.body.dataset.panel,'media');
 d.getElementById('studio-panel').open=true;await tick();assert.equal(d.body.dataset.panel,'speech');
 switchTo('ui-language','en');await tick();assert.equal(d.getElementById('save').textContent,'Save timeline');assert.equal(caption.value,'修正 Save timeline');
 // Preferences are account-specific, and storage-denied environments still work.
 switchTo('ui-language','zh-hans');switchTo('ui-layout','classic');
 w.AuracutUI.setAccount('editor2');assert.equal(d.documentElement.lang,'zh-Hans'); // current explicit choice is retained within this session
 assert(JSON.parse(w.localStorage.getItem('auracut.ui.editor1')).language==='zh-hans');
 const second=setup();await tick();assert.equal(second.window.document.documentElement.lang,'en');second.window.close();
 Object.defineProperty(w,'localStorage',{get(){throw Error('blocked')}});switchTo('ui-language','en');assert.equal(d.documentElement.lang,'en');
 // Translation templates retain caller data literally, including markup.
 assert.equal(w.AuracutUI.text('Could not save: <script>','zh-hans'),'无法保存：<script>');
 assert.equal(w.AuracutUI.text('Unknown service error','zh-hans'),'Unknown service error');
 dom.window.close();console.log('PASS: clean/Classic, three languages, live controls, unsaved edits, private text, captions, reviewed exclusions, auto studio tab, storage isolation/failure and literal templates');
})().catch(e=>{console.error(e);process.exitCode=1});
