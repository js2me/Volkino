'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {boot} = require('./helpers/models');
const status = {state:'available',supported:true,current:'0.9.2',build:11,latest:'v0.9.2-build.12',received:0,total:123,error:''};
test('settings check, download, poll and hand the verified APK to Android installer', t => {
  const h = boot(t); const settings = h.settings();
  settings.updateApp(); h.reply('updates/check',status);
  assert.match(settings.updateMessage,/build.12/);
  settings.updateApp(); h.reply('updates/download',{...status,state:'downloading'});
  h.advance(1000); h.reply('updates',{...status,state:'ready'});
  let installs = 0; window.TWNativeUpdater = {install(){installs++;}};
  settings.updateApp(); assert.equal(installs,1);
  settings.unmount();
});
test('webOS requests installation and unmounted settings ignore late update checks', t => {
  const h=boot(t), settings=h.settings();
  settings.updateApp(); h.reply('updates/check',{...status,state:'ready'});
  settings.updateApp(); h.reply('updates/install',{...status,state:'installing'});
  assert.match(settings.updateMessage,/перезапустится/);
  settings.updateApp(); settings.unmount(); h.reply('updates/check',status);
  assert.equal(settings.updateStatus.state,'installing');
});
