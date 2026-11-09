import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const android = path.join(root, 'android');
const legacy = process.argv.includes('--android6');
const flavor = legacy ? 'android6' : 'modern';
const nodeVersion = legacy ? '16.17.0' : '18.20.4';
const nodeTag = legacy ? `nodejs-mobile-v${nodeVersion}` : `v${nodeVersion}`;
const vendor = path.join(android, 'vendor', flavor);
fs.mkdirSync(vendor, { recursive: true });
const lock = {
  ...JSON.parse(fs.readFileSync(path.join(android, 'vendor-lock.json'))),
  ...(legacy ? JSON.parse(fs.readFileSync(path.join(android, 'vendor-lock-android6.json'))) : {}),
};
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const [name, info] of Object.entries(lock)) {
  const file = path.join(vendor, name);
  if (fs.existsSync(file) && digest(file) === info.sha256) continue;
  console.log(`Downloading ${name}`);
  const response = await fetch(info.url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(data).digest('hex') !== info.sha256) throw new Error(`${name}: SHA-256 mismatch`);
  fs.writeFileSync(file, data);
}
// Always extract from the verified archive, rather than trusting an old extracted tree.
const nodeDir = path.join(android, 'vendor', legacy ? 'node-android6' : 'node');
const extracted = path.join(vendor, 'extracted');
fs.rmSync(extracted, { recursive: true, force: true });
execFileSync('unzip', ['-q', path.join(vendor, 'node.zip'), '-d', extracted]);
// v16 archives have an extra top-level directory; v18 archives do not.
const archiveRoot = legacy ? path.join(extracted, `nodejs-mobile-v${nodeVersion}-android`) : extracted;
fs.rmSync(nodeDir, { recursive: true, force: true });
fs.renameSync(archiveRoot, nodeDir);
const generated = path.join(android, 'app/build/generated', flavor);
const assets = path.join(generated, 'assets');
const staging = path.join(generated, 'runtime');
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(path.join(staging, 'app'), { recursive: true });
fs.mkdirSync(assets, { recursive: true });
for (const name of ['index.html', 'catalog.js', 'catalog.css', 'icon.png', 'wolf.png']) {
  fs.copyFileSync(path.join(root, 'app', name), path.join(staging, 'app', name));
}
fs.cpSync(path.join(root, 'server'), path.join(staging, 'server'), { recursive: true });
fs.writeFileSync(path.join(staging, 'server/build-info.json'), JSON.stringify({version:JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version, build:Number(process.env.GITHUB_RUN_NUMBER || 0), versionCode:Number(process.env.VOLKINO_VERSION_CODE || 902), platform:legacy ? 'android6' : 'android'}));
const archive = path.join(assets, 'runtime.zip');
fs.rmSync(archive, { force: true });
execFileSync('zip', ['-qr', archive, 'app', 'server'], { cwd: staging });
for (const [abi, arch] of Object.entries({ 'armeabi-v7a': 'arm7', 'arm64-v8a': 'arm64', x86_64: 'amd64' })) {
  const dir = path.join(generated, 'jniLibs', abi);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(vendor, `TorrServer-android-${arch}`), path.join(dir, 'libtorrserver.so'));
}
for (const name of ['NODE-LICENSE', 'TORRSERVER-LICENSE']) fs.copyFileSync(path.join(vendor, name), path.join(assets, name));
fs.copyFileSync(path.join(android, 'LIBVLC-LICENSE'), path.join(assets, 'LIBVLC-LICENSE'));
fs.writeFileSync(path.join(assets, 'THIRD-PARTY-NOTICES.txt'), `VolKino includes Node.js Mobile v${nodeVersion} (MIT and third-party licenses, see NODE-LICENSE) and TorrServer MatriX.147.2 (GPL-3.0, see TORRSERVER-LICENSE).\nLibVLC Android 3.6.5 (LGPL-2.1, see LIBVLC-LICENSE). Source and build scripts: https://code.videolan.org/videolan/libvlcjni/-/tree/3.6.5\nSources: https://github.com/nodejs-mobile/nodejs-mobile/tree/${nodeTag}\nhttps://github.com/YouROK/TorrServer/tree/MatriX.147.2\n`);
const drawable = path.join(android, 'app/src/main/res/drawable');
fs.copyFileSync(path.join(root, 'app/icon-large.png'), path.join(drawable, 'icon.png'));
if (process.argv.includes('--prepare')) { console.log('Android assets prepared'); process.exit(0); }
const release = process.argv.includes('--release');
const variant = flavor[0].toUpperCase() + flavor.slice(1) + (release ? 'Release' : 'Debug');
execFileSync(path.join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), [`assemble${variant}`, '--console=plain'], { cwd: android, stdio: 'inherit' });
const type = release ? 'release' : 'debug';
const unsigned = release && !process.env.ANDROID_KEYSTORE_PATH;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const dest = path.join(root, 'dist', `volkino_${pkg.version}_${legacy ? 'android6' : 'android'}-${type}${unsigned ? '-unsigned' : ''}.apk`);
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(path.join(android, `app/build/outputs/apk/${flavor}/${type}/app-${flavor}-${type}${unsigned ? '-unsigned' : ''}.apk`), dest);
console.log(dest);
