'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const audio=require('../server/webos-audio');
function fixture(output='tv_speaker',initial='off') {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'volkino-audio-'));
 const settings={autoVolume:initial,soundOutput:output},writes=[];
 const call=async(method,payload)=>{if(method==='getSystemSettings')return {settings:{...settings}};writes.push(payload.settings.autoVolume);Object.assign(settings,payload.settings);return {returnValue:true};};
 const create=()=>audio.create({directory,call,supported:true});
 return {directory,settings,writes,create,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
test('native normalization enables LG auto-volume, renews lease, restores on exit',async()=>{
 const f=fixture(),a=f.create();try {await a.ready;
 assert.equal((await a.set('night','one')).active,true);assert.equal(f.settings.autoVolume,'on');
 await a.set('moderate','one');await a.set('off','old');assert.equal(f.settings.autoVolume,'on');
 await a.set('off','one');assert.equal(f.settings.autoVolume,'off');
 }finally{await a.close();f.cleanup();}
});
test('optical audio is reported unsupported without changing TV settings',async()=>{
 const f=fixture('external_optical'),a=f.create();try {await a.ready;const r=await a.set('night','one');assert.equal(r.active,false);assert.match(r.message,/external_optical/);assert.deepEqual(f.writes,[]);}finally{await a.close();f.cleanup();}
});
test('recovery journal restores settings after a helper crash',async()=>{
 const f=fixture();fs.writeFileSync(path.join(f.directory,'audio-restore.json'),JSON.stringify({autoVolume:'off'}));f.settings.autoVolume='on';
 const a=f.create();try{await a.ready;assert.equal(f.settings.autoVolume,'off');assert.equal(fs.existsSync(path.join(f.directory,'audio-restore.json')),false);}finally{await a.close();f.cleanup();}
});
test('preserves original enabled setting and viewer changes',async()=>{
 const f=fixture('tv_speaker','on'),a=f.create();try{await a.ready;await a.set('night','one');await a.set('off','one');assert.equal(f.settings.autoVolume,'on');
 await a.set('night','two');f.settings.autoVolume='off';await a.set('off','two');assert.equal(f.settings.autoVolume,'off');}finally{await a.close();f.cleanup();}
});
