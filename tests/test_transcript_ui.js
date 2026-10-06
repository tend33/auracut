// Exercise the actual browser save and plan flow with a server response that
// omits selection metadata, rather than testing redraw in isolation.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(require('path').join(__dirname, '../static/app.js'), 'utf8');
const nodes = {};
function node() { return {children: [], dataset: {}, hidden: false, selectedOptions:[{textContent:'English'}], append(...items) {this.children.push(...items);}, replaceChildren() {this.children=[];}, setAttribute() {}, addEventListener() {}, pause() {}}; }
const initial = {id:'p', selection_mode:'speech', clip_ids:['a'], transcripts:{a:[{word:'Hello',start:0,end:1},{word:'um',start:1,end:2}]}, captions:[]};
let saved;
const c = {project:initial, pendingCaptionLanguage:null, projectBusy:false, projectDirty:false, document:{createElement:node, createTextNode:x=>x, querySelectorAll(selector) {const inputs=nodes['transcript-words'].children.map(x=>x.children[0]); return selector.includes(':checked') ? inputs.filter(x=>x.checked) : inputs;}}, $:id=>nodes[id] ||= node(), timing:{formatTime:String}, studioReport(){}, studioBusy(){}, markDirty(){}, exitCut(){}, draw(){}, refreshProjects:async()=>{}, setBusy:x=>c.projectBusy=x, state(){}, studioCall:async operation=>operation==='smart' ? {remove:[1], reason:'filler'} : {report:{summary:'plan'}}, api:async(url,options)=>{if(options) saved=JSON.parse(options.body); return JSON.parse(JSON.stringify(initial));}};
vm.createContext(c);
vm.runInContext(source.slice(source.indexOf('function rememberTranscriptSelection()'),source.indexOf('async function studioCall')),c);
vm.runInContext(source.slice(source.indexOf('async function save()'),source.indexOf("$('save').addEventListener")),c);
vm.runInContext(source.slice(source.indexOf('async function runStudio('),source.indexOf("$('speech-start').addEventListener")),c);
(async()=>{
 c.drawStudio(); await c.runStudio('smart');
 assert.strictEqual(nodes['transcript-words'].children[1].children[0].checked,false);
 await c.runStudio('plan');
 assert.deepStrictEqual(saved.transcript_keep,[0]);
 assert.strictEqual(nodes['transcript-words'].children[1].children[0].checked,false);
 nodes['transcript-words'].children[0].children[0].checked=false;
 await c.runStudio('plan');
 assert.deepStrictEqual(saved.transcript_keep,[]);
 assert(nodes['transcript-words'].children.every(x=>!x.children[0].checked));
 let resolveConversion;
 c.project.captions=[{start:0,end:1,text:'你好'}];
 c.studioCall=async(operation,extra)=>{
  assert.strictEqual(extra.language,'en');
  assert.strictEqual(nodes['caption-language'].value,'en');
  return new Promise(resolve=>resolveConversion=resolve);
 };
 c.installProject=data=>{c.project=data;c.drawStudio();};
 const converting=c.runStudio('caption-language',{language:'en'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.strictEqual(nodes['caption-language'].value,'en');
 assert(nodes['caption-language-status'].textContent.includes('running'));
 resolveConversion({project:{...initial,caption_language:'en',captions:[{start:0,end:1,text:'Hello'}]}});
 await converting;
 assert.strictEqual(nodes['caption-language'].value,'en');
 assert.strictEqual(c.project.captions[0].text,'Hello');
 assert(nodes['caption-language-status'].textContent.includes('applied'));
 c.studioCall=async()=>{throw Error('AI service unavailable');};
 await c.runStudio('caption-language',{language:'en'});
 assert(nodes['caption-language-status'].textContent.includes('Conversion failed'));
 console.log('PASS: caption target preserved while saving/converting, applied results and visible failure');
 console.log('PASS: smart exclusions and manual selections survive save, fetch and plan review');
})().catch(error=>{console.error(error);process.exitCode=1;});
