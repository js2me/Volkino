'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function boot(){
  const listeners={},elements={};let clicks=0,submitted=0;
  const element=id=>elements[id]||(elements[id]={id,tagName:'DIV',addEventListener(){},className:'',style:{},textContent:''});
  const document={getElementById:element,activeElement:{tagName:'BUTTON',click(){clicks++;}},querySelectorAll(){return[];},addEventListener(type,fn){listeners[type]=fn;},createEvent(){return{initEvent(){}};}};
  const window={addEventListener(){}};
  function XHR(){}XHR.prototype.open=function(){};XHR.prototype.setRequestHeader=function(){};XHR.prototype.send=function(){};
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/app.js'),'utf8'),{document,window,localStorage:{getItem(){return'[]';}},XMLHttpRequest:XHR,TWHistory:require('../app/history'),TWPlayback:require('../app/playback'),setTimeout,clearTimeout,console});
  function key(type,repeat){let prevented=false;listeners[type]({keyCode:13,repeat:!!repeat,preventDefault(){prevented=true;}});return prevented;}
  return{document,window,key,clicks:()=>clicks,submitted:()=>submitted,input(){document.activeElement={tagName:'INPUT',form:{dispatchEvent(){submitted++;}}};}};
}
test('webOS OK explicitly activates the focused button once without browser-synthesized click',()=>{
  const h=boot();assert.equal(h.key('keydown'),true);assert.equal(h.clicks(),1);
  h.key('keydown',true);h.key('keydown');assert.equal(h.clicks(),1,'holding OK must not activate twice');
  assert.equal(h.key('keyup'),true);h.key('keydown');assert.equal(h.clicks(),2,'a second physical OK must activate again');
});
test('webOS OK submits the search field exactly once',()=>{
  const h=boot();h.input();assert.equal(h.key('keydown'),true);assert.equal(h.submitted(),1);h.key('keyup');h.key('keydown');assert.equal(h.submitted(),2);
});
test('webOS OK delegates select activation to the remote picker once per physical press',()=>{
  const h=boot();let opened=0;h.document.activeElement={tagName:'SELECT'};
  h.window.TWNavigation={handleKeyDown(event){opened++;event.preventDefault();return true;}};
  assert.equal(h.key('keydown'),true);assert.equal(opened,1);
  h.key('keydown',true);h.key('keydown');assert.equal(opened,1);
  h.key('keyup');assert.equal(h.key('keydown'),true);assert.equal(opened,2);
});
