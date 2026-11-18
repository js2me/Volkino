'use strict';
var fs = require('fs'), cp = require('child_process'), URL=require('url');
function create(options) {
  options = options || {};
  var overlays=Object.create(null);
  var supported = options.supported === undefined ? fs.existsSync('/etc/palm') && fs.existsSync('/usr/bin/luna-send') : options.supported;
  var call = options.call || function(method, payload) {
    return new Promise(function(resolve, reject) {
      cp.execFile('/usr/bin/luna-send', ['-n','1','-f','luna://com.webos.media/' + method,JSON.stringify(payload)],
        {timeout:5000,maxBuffer:512*1024}, function(error, out) {
          if (error) return reject(error);
          try { var data=JSON.parse(out); if (!data.returnValue) throw new Error(data.errorText && data.errorText !== 'No Error' ? data.errorText : 'LG не поддерживает эту команду субтитров'); resolve(data); }
          catch(e) { reject(e); }
        });
    });
  };
  function identity(value) {
    if (!supported) throw new Error('Нативные субтитры LG недоступны');
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(String(value || ''))) throw new Error('Некорректный плеер');
    return String(value);
  }
  function read(value) {
    var id = identity(value);
    return call('getPipelineState',{mediaId:id}).then(function(response) {
      var state=typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      var args=state && state.args, option=args && args[1] && args[1].option;
      if (!option || option.appId !== 'org.torrenter.watcher') throw new Error('Этот поток не принадлежит VolKino');
      var uri=URL.parse(String(args[0]||''),true), textKey=uri.pathname==='/stream'&&/^[a-f0-9]{40}$/i.test(uri.query.hash||'')&&/^\d+$/.test(String(uri.query.index))?String(uri.query.hash).toLowerCase()+':'+Number(uri.query.index):'';
      var textTracks=textKey&&options.textTracks?options.textTracks(textKey):[];
      var source=state.sourceInfo || {}, program=(source.programInfo || [])[0] || {};
      var tracks=(program.subtitleTrackInfo || []).map(function(track,index) {
        var language=String(track.language || '');
        if (language === '(null)' || language === 'und') language='';
        return {index:Number.isInteger(track.trackNum) && track.trackNum >= 0 ? track.trackNum : index,
          label:textTracks[index]&&textTracks[index].label||language||'Дорожка '+(index+1),renderable:!!(textTracks[index]&&textTracks[index].renderable)};
      });
      var overlay=overlays[id];
      return {mediaId:id,tracks:tracks,renderer:overlay?'app':'native',enabled:overlay?overlay.enabled:state.setSubtitleEnable && typeof state.setSubtitleEnable.enable === 'boolean' ? state.setSubtitleEnable.enable : null,
        selected:overlay?overlay.selected:state.selectTrack && state.selectTrack.type === 'text' ? state.selectTrack.index : null};
    });
  }
  function select(value, index) {
    if (!Number.isInteger(index) || index < -1) return Promise.reject(new Error('Некорректная дорожка субтитров'));
    return Promise.resolve().then(function(){return read(value);}).then(function(state) {
      if (index >= 0 && !state.tracks.some(function(t){return t.index === index;})) throw new Error('Дорожка субтитров недоступна');
      var custom=index>=0&&state.tracks.some(function(t){return t.index===index&&t.renderable;})||index<0&&state.renderer==='app';
      if(custom){return call('setSubtitleEnable',{mediaId:state.mediaId,enable:false}).then(function(){
        if(Object.keys(overlays).length>8)overlays=Object.create(null);
        overlays[state.mediaId]={enabled:index>=0,selected:index>=0?index:state.selected};
        return read(state.mediaId);
      });}
      delete overlays[state.mediaId];
      var select=index < 0 ? Promise.resolve() : call('selectTrack',{mediaId:state.mediaId,type:'text',index:index});
      return select.then(function(){return call('setSubtitleEnable',{mediaId:state.mediaId,enable:index>=0});}).then(function(){return read(state.mediaId);}).then(function(result) {
        if (result.enabled !== (index >= 0) || index >= 0 && result.selected !== index) throw new Error('LG не применил выбор субтитров');
        return result;
      });
    });
  }
  return {supported:supported,read:read,select:select};
}
module.exports={create:create};
