/* Run with the TV's Node 8 as root after copying the IPK into /tmp. */
'use strict';
var cp = require('child_process'), fs = require('fs'), http = require('http');
var ipk = process.argv[2], ts = process.argv[3] || '';
if (!ipk || !fs.existsSync(ipk)) throw new Error('Pass the staged .ipk path');
// A launch request can reuse the old live page, including cached JS/CSS.
// Fully close our app before replacing it so the new version is actually loaded.
try { cp.execFileSync('luna-send',['-n','1','luna://com.webos.applicationManager/close','{"id":"org.torrenter.watcher"}']); } catch (_) {}
var child = cp.spawn('/usr/bin/luna-send', ['-i','-f','luna://com.webos.appInstallService/dev/install', JSON.stringify({ id:'org.torrenter.watcher', ipkUrl:ipk, subscribe:true })]);
var buffer = '', done = false;
var timeout = setTimeout(function () { fail('Installation timeout'); }, 60000);
function fail(message) { if(done)return; done=true;clearTimeout(timeout);child.kill();console.error(message);process.exitCode=1; }
child.stdout.on('data', function(c) {
  process.stdout.write(c);buffer+=c;
  if (/"returnValue"\s*:\s*false/.test(buffer) || /"errorCode"\s*:\s*-?[1-9]/.test(buffer)) return fail('Installation failed');
  if (/"statusValue"\s*:\s*30/.test(buffer)) {
    done=true;clearTimeout(timeout);child.kill();
    try {
      var base='/var/lib/torrenter-watcher';
      if(!fs.existsSync(base))fs.mkdirSync(base,448);
      if(ts) {
        var config={};try{config=JSON.parse(fs.readFileSync(base+'/config.json','utf8'));}catch(_){}
        config.torrserverUrl=ts;fs.writeFileSync(base+'/config.json',JSON.stringify(config,null,2),{mode:384});
      }
      cp.execFileSync('cp',['/media/developer/apps/usr/palm/applications/org.torrenter.watcher/scripts/start-tv.sh','/var/lib/webosbrew/init.d/65-torrenter-watcher']);
      fs.chmodSync('/var/lib/webosbrew/init.d/65-torrenter-watcher',493);
      cp.execFileSync('/bin/sh',['/var/lib/webosbrew/init.d/65-torrenter-watcher','restart']);
      var tries=0;
      function check() {
        var r=http.get('http://127.0.0.1:32190/api/session',function(res){res.resume();if(res.statusCode!==200)return retry();console.log('Helper ready. Launching app.');cp.execFileSync('luna-send',['-n','1','luna://com.webos.applicationManager/launch','{"id":"org.torrenter.watcher"}'],{stdio:'inherit'});});
        r.on('error',retry);r.setTimeout(2000,function(){r.destroy();});
      }
      function retry(){if(++tries>15){console.error('Helper startup failed; inspect '+base+'/helper.log');process.exitCode=1;return;}setTimeout(check,1000);}
      check();
    }catch(e){console.error(e.message);process.exitCode=1;}
  }
});
child.stderr.on('data',function(c){process.stderr.write(c);});
child.on('error',function(e){fail(e.message);});
child.on('exit',function(){if(!done)fail('Installer exited before completion');});
