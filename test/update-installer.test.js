'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const source = fs.readFileSync(path.join(__dirname,'../scripts/install-on-tv.js'),'utf8');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'volkino-installer-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const ipk=path.join(directory,'update.ipk'), script=path.join(directory,'installer.js');
  fs.writeFileSync(ipk,'package'); fs.writeFileSync(script,source);
  const events={}, child=new EventEmitter(); child.stdout=new EventEmitter(); child.stderr=new EventEmitter(); child.kill=()=>{};
  const processMock={argv:['node',script,ipk],env:{TW_UPDATE_CLEANUP:'1'},on(name,fn){events[name]=fn;},stdout:{write(){}},stderr:{write(){}}};
  let restarted=false;
  vm.runInNewContext(source,{
    __filename:script,process:processMock,console:{log(){},error(){}},setTimeout,clearTimeout,
    require(name) {
      if(name==='fs') return {existsSync(file){return file===ipk || file==='/var/lib/torrenter-watcher';},unlinkSync:fs.unlinkSync,readFileSync(){return JSON.stringify({id:'org.torrenter.watcher',title:'VolKino',icon:'icon.png',largeIcon:'icon-large.png'});},chmodSync(){}};
      if(name==='child_process') return {spawn(){return child;},execFileSync(command){if(command==='/bin/sh'){assert.equal(fs.existsSync(ipk),false);assert.equal(fs.existsSync(script),false);restarted=true;}}};
      if(name==='http') return {get(url,callback){callback({statusCode:200,resume(){}});return {on(){},setTimeout(){}};}};
      throw new Error(name);
    }
  });
  return {ipk,script,child,processMock,exit:()=>events.exit(),get restarted(){return restarted;}};
}
test('webOS deletes the IPK and temporary installer before restarting the helper',t=>{
  const f=fixture(t);
  f.child.stdout.emit('data',Buffer.from('{"returnValue":true,"statusValue":30}'));
  assert.equal(f.restarted,true);
  assert.equal(fs.existsSync(f.ipk),false);
  assert.equal(fs.existsSync(f.script),false);
  f.exit(); // Cleanup is safe to repeat.
});
test('webOS installation failure removes both installer files on exit',t=>{
  const f=fixture(t);
  f.child.stdout.emit('data',Buffer.from('{"returnValue":false,"errorCode":5}'));
  assert.equal(f.processMock.exitCode,1);
  f.exit();
  assert.equal(fs.existsSync(f.ipk),false);
  assert.equal(fs.existsSync(f.script),false);
  assert.equal(f.restarted,false);
});
