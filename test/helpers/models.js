const { MagnetVM } = require('../../work/test-models/src/screens/magnet/model/index.js');
const { FilmixSearchVM } = require('../../work/test-models/src/screens/filmix-search/model/index.js');
const { FilesVM } = require('../../work/test-models/src/screens/files/model/index.js');
const { DetailsVM } = require('../../work/test-models/src/screens/details/model/index.js');
const { reaction } = require('mobx');
// The test script compiles the same production models to CommonJS for Node.
const { Globals } = require('../../work/test-models/src/globals/index.js');
const { PlayerVM } = require('../../work/test-models/src/app/player/model.js');
const { SettingsVM } = require('../../work/test-models/src/screens/settings/model/index.js');
const hash = '0123456789abcdef0123456789abcdef01234567';
const files = [{id:1,path:'Season 1/Episode 01.mkv',length:1000},{id:2,path:'Season 1/Episode 02.mkv',length:1000},{id:3,path:'Season 2/Episode 01.mkv',length:1000}];
function boot(t, saved = [], nativePlayer) {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:100000});
  const stored = {}, requests = [], elements = {};
  const body = {tagName:'BODY'};
  const document = {activeElement:body,body,getElementById:id=>elements[id],addEventListener(){},removeEventListener(){}};
  const root = {querySelector(){return null;},querySelectorAll(){return[];},contains(){return false;}};
  const window = {TWNativePlayer:nativePlayer,addEventListener(){},removeEventListener(){}};
  const restorers = [];
  for (const [key,value] of Object.entries({document,window,localStorage:{getItem:()=>JSON.stringify(saved),setItem:(key,value)=>{stored[key]=value;}}})) {
    const old = Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    restorers.push(()=>{if(old)Object.defineProperty(globalThis,key,old);else delete globalThis[key];});
  }
  const globals = new Globals();
  globals.navigation = {close(){},handleKeyDown(){return false;},navigate(){return true;}};
  const params = {id:'test',data:{globals},payload:{},vmConfig:{observable:{viewModels:{useDecorators:false}}}};
  const app = globals;
  app.root = root; app.historyItems = saved; app.source = 'torrent'; app.hash = hash; app.originalLink = 'magnet:?xt=urn:btih:'+hash; app.torrent = {title:'Series'}; app.files = files.map(f=>({...f})); app.view = 'files';
  app.api = (route,body,done) => {requests.push({route,body,done,settled:false});};
  const player = new PlayerVM({...params,id:'player'});
  const listeners = {};
  const video = {readyState:0,paused:true,seeking:false,duration:NaN,currentTime:0,style:{},isConnected:true,addEventListener(type,fn){(listeners[type] ||= []).push(fn);},emit(type){for(const fn of listeners[type]||[])fn();},focus(){document.activeElement=this;},pause(){this.paused=true;this.emit('pause');},play(){this.paused=false;return Promise.resolve();},removeAttribute(){this.src='';},load(){this.readyState=0;this.duration=NaN;this.currentTime=0;}};
  player.root=root; player.video=video; player.bindVideo(); player.afterRender=callback=>callback(root); app.afterRender=callback=>callback(root);
  let screen;
  const stopRouting = reaction(() => globals.routeRevision, () => {
    screen?.unmount();
    const Constructor = {details:DetailsVM,files:FilesVM,'filmix-search':FilmixSearchVM,magnet:MagnetVM}[globals.view];
    screen = Constructor ? new Constructor({...params,id:'screen'}) : undefined;
    if (screen) { screen.root = root; screen.afterRender = callback => callback(root); screen.mount(); }
  });
  function key(code,repeat=false) { let prevented=false; const event={keyCode:code,repeat,preventDefault(){prevented=true;}}; player.keyDown(event); player.keyUp(event); return prevented; }
  function ready(position=100,type='playing'){video.duration=1000;video.currentTime=position;video.readyState=4;video.paused=false;video.emit(type);}
  function play(){player.play(files[0]);t.mock.timers.tick(100);ready();}
  function reply(route,data,error=null){const pending=requests.find(r=>!r.settled&&r.route.startsWith(route));if(!pending)throw new Error('No pending '+route);pending.settled=true;pending.done(error,data);}
  t.after(()=>{stopRouting();screen?.unmount();player.stop();restorers.forEach(restore=>restore());});
  return {get screen(){return screen;},app,player,video,document,window,globals,elements,root,requests,stored,key,ready,play,reply,advance:ms=>t.mock.timers.tick(ms),settings:()=>new SettingsVM({...params,id:'settings'})};
}
module.exports = {boot,files,hash};
