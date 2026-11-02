'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {boot}=require('./helpers/models');
test('webOS OK activates a focused button once per physical press',t=>{
 const h=boot(t);let clicks=0;h.document.activeElement={tagName:'BUTTON',click(){clicks++;}};
 const event={keyCode:13,preventDefault(){}};
 h.player.keyDown(event);h.player.keyDown({...event,repeat:true});h.player.keyDown(event);assert.equal(clicks,1);
 h.player.keyUp(event);h.player.keyDown(event);assert.equal(clicks,2);
});
test('webOS OK submits the focused input form',t=>{
 const h=boot(t);let submitted=0;h.document.activeElement={tagName:'INPUT',form:{dispatchEvent(){submitted++;}}};h.key(13);h.key(13);assert.equal(submitted,2);
});
test('OK delegates native selects to the remote picker once per physical press',t=>{
 const h=boot(t);let opened=0;h.document.activeElement={tagName:'SELECT'};h.globals.navigation={handleKeyDown(){opened++;return true;}};
 const event={keyCode:13,preventDefault(){}};h.player.keyDown(event);h.player.keyDown({...event,repeat:true});h.player.keyDown(event);assert.equal(opened,1);h.player.keyUp(event);h.player.keyDown(event);assert.equal(opened,2);
});
