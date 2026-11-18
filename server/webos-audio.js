'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');

// URL playback on webOS bypasses Web Audio. Use LG's native auto-volume instead.
// Keep a recovery journal because these settings otherwise survive app exit/reboot.
function create(options) {
  var file = path.join(options.directory, 'audio-restore.json');
  var call = options.call || function(method, payload) {
    return new Promise(function(resolve, reject) {
      cp.execFile('/usr/bin/luna-send', ['-n','1','-f','luna://com.webos.settingsservice/' + method,JSON.stringify(payload)],
        {timeout:5000,maxBuffer:128*1024}, function(error, out) {
          if (error) return reject(error);
          try { var data = JSON.parse(out); if (!data.returnValue) throw new Error(data.errorText || 'LG отклонил настройку звука'); resolve(data); }
          catch(e) { reject(e); }
        });
    });
  };
  var supported = options.supported === undefined ? fs.existsSync('/etc/palm') && fs.existsSync('/usr/bin/luna-send') : options.supported;
  var owner = '', expires = 0, saved = null, queue = Promise.resolve();
  if (supported) try { saved = JSON.parse(fs.readFileSync(file,'utf8')); } catch(_) {}
  function read() { return call('getSystemSettings',{category:'sound',keys:['autoVolume','soundOutput']}).then(function(d){return d.settings;}); }
  function write(value) { return call('setSystemSettings',{category:'sound',settings:{autoVolume:value}}); }
  function restore() {
    if (!saved) return Promise.resolve();
    return read().then(function(current) {
      // Respect a change made by the viewer in the TV's own settings.
      return current.autoVolume === 'on' ? write(saved.autoVolume) : null;
    }).then(function(){saved=null;owner='';try{fs.unlinkSync(file);}catch(_){};});
  }
  function serial(fn) { var result=queue.then(fn);queue=result.catch(function(){});return result; }
  var ready = supported ? serial(restore) : Promise.resolve();
  function set(mode, lease) {
    if (['off','moderate','night'].indexOf(mode)<0 || !/^[a-zA-Z0-9-]{1,80}$/.test(String(lease||''))) return Promise.reject(new Error('Некорректный режим звука'));
    if (!supported) return Promise.resolve({active:false,message:'Обработка LG недоступна'});
    return serial(function() {
      if (mode === 'off') return (owner === lease ? restore() : Promise.resolve()).then(function(){return {active:false};});
      return read().then(function(current) {
        // LG's sound engine does not process optical/ARC bitstream outputs.
        if (['tv_speaker','headphone','tv_speaker_headphone'].indexOf(current.soundOutput)<0)
          return restore().then(function(){return {active:false,message:'Автогромкость LG недоступна для этого выхода ('+current.soundOutput+'). Используйте динамики ТВ или обработку на внешней аудиосистеме'};});
        if (!saved) {
          if (['on','off'].indexOf(current.autoVolume)<0) throw new Error('LG не поддерживает автогромкость');
          saved={autoVolume:current.autoVolume};
          fs.writeFileSync(file,JSON.stringify(saved),{mode:384});
        }
        return write('on').then(read).then(function(check) {
          if (check.autoVolume !== 'on') throw new Error('LG не включил автогромкость');
          owner=lease;expires=Date.now()+45000;
          return {active:true,message:'Автогромкость LG включена'};
        });
      }).catch(function(error) {return restore().then(function(){throw error;});});
    });
  }
  var timer=setInterval(function(){if(saved && Date.now()>expires)serial(function(){return saved && Date.now()>expires ? restore() : null;}).catch(function(){});},5000);
  timer.unref();
  return {supported:supported, ready:ready, set:set, close:function(){clearInterval(timer);return serial(restore);}};
}
module.exports={create:create};
