import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

// Exercise the actual APK runtime, including native linking and the bundled Go binary.
const apk = process.argv[2];
if (!apk) throw new Error('Usage: node scripts/android-smoke.mjs <debug.apk>');
const adb = (...args) => execFileSync(process.env.ADB || 'adb', args, { encoding: 'utf8', timeout: 30000 });
const app = 'org.torrenter.watcher';
let forward;
try {
  adb('install', '-r', apk);
  adb('shell', 'am', 'force-stop', app);
  adb('logcat', '-c');
  adb('shell', 'am', 'start', '-W', '-n', `${app}/.MainActivity`);
  const deadline = Date.now() + 60000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (!forward) {
        const prefs = adb('shell', 'run-as', app, 'cat', 'shared_prefs/runtime.xml');
        const port = prefs.match(/name="port" value="(\d+)"/);
        if (!port) throw new Error('Runtime has not selected a port');
        forward = adb('forward', 'tcp:0', `tcp:${port[1]}`).trim();
      }
      const base = `http://127.0.0.1:${forward}`;
      const session = await fetch(base + '/api/session', { signal: AbortSignal.timeout(3000) });
      if (!session.ok) throw new Error(`Session: HTTP ${session.status}`);
      const { token } = await session.json();
      if (!token) throw new Error('Missing session token');
      const health = await fetch(base + '/api/health', {
        headers: { 'X-App-Token': token }, signal: AbortSignal.timeout(8000),
      });
      const result = await health.json();
      if (!health.ok || !result.ok) throw new Error(JSON.stringify(result));
      const html = await fetch(base + '/', { signal: AbortSignal.timeout(3000) });
      if (!html.ok || !(await html.text()).includes('/catalog.js')) throw new Error('UI assets unavailable');
      console.log(`Android ${adb('shell', 'getprop', 'ro.build.version.release').trim()}: Node.js session, UI assets and TorrServer ${result.version} OK`);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      await setTimeout(1000);
    }
  }
  if (lastError) throw lastError;
} catch (error) {
  console.error(adb('logcat', '-d', '-t', '500'));
  throw error;
} finally {
  if (forward) adb('forward', '--remove', `tcp:${forward}`);
}
