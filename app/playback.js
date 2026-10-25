/* ES5 seek coordination for webOS: coalesce key repeats, expose pending seek,
 * and bound native media waits instead of leaving a frozen-looking frame. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TWPlayback = api;
}(this, function () {
  'use strict';
  function clamp(time, duration) {
    if (!isFinite(time) || !isFinite(duration) || duration <= 0) return null;
    return Math.max(0, Math.min(time, Math.max(0, duration - 1)));
  }
  function pointerTime(x, left, width, duration) {
    if (!isFinite(x) || !isFinite(left) || !isFinite(width) || width <= 0) return null;
    return clamp(Math.max(0, Math.min(1, (x-left)/width))*duration, duration);
  }
  function create(video, options) {
    options=options||{};
    var later=options.setTimeout||setTimeout, cancelTimer=options.clearTimeout||clearTimeout;
    var desired=null, pending=null, deadline=null, busy=false, resume=false;
    function notify(name,value){if(options[name])options[name](value);}
    function cancel(){cancelTimer(pending);cancelTimer(deadline);pending=null;deadline=null;desired=null;busy=false;resume=false;}
    function fail(message){cancel();notify('onError',message);}
    function commit(){
      pending=null;busy=true;notify('onStart',desired);
      deadline=later(function(){fail('Перемотка не завершилась за 45 секунд. Выберите другое место на полосе или нажмите BACK.');},options.timeout||45000);
      try{video.currentTime=desired;}catch(_){fail('Этот файл не поддерживает перемотку в выбранное место.');}
    }
    function to(value){
      if(!(video.readyState>=1))return false;
      var time=clamp(value,video.duration);if(time===null)return false;
      if(desired===null)resume=!video.paused;
      cancelTimer(pending);cancelTimer(deadline);deadline=null;desired=time;
      notify('onPreview',time);pending=later(commit,options.debounce==null?250:options.debounce);return true;
    }
    function by(delta){return to((desired===null?video.currentTime:desired)+delta);}
    function update(){
      if(!busy||pending!==null||video.seeking||video.readyState<3||Math.abs(video.currentTime-desired)>3)return;
      var shouldResume=resume;cancel();notify('onDone');
      if(shouldResume&&video.paused){try{var p=video.play();if(p&&p.catch)p.catch(function(){notify('onError','Нажмите OK, чтобы продолжить просмотр.');});}catch(_){notify('onError','Нажмите OK, чтобы продолжить просмотр.');}}
    }
    return {to:to,by:by,update:update,cancel:cancel,target:function(){return desired;},isBusy:function(){return desired!==null;},pausedIntent:function(paused){if(desired!==null)resume=!paused;}};
  }
  return {clamp:clamp,pointerTime:pointerTime,create:create};
}));
