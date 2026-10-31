import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const id = JSON.parse(fs.readFileSync(path.join(root, 'app/appinfo.json'))).id;
const dest = path.join(root, 'dist');
const staging = fs.mkdtempSync(path.join(destMake(), '.package-'));
function destMake() { fs.mkdirSync(dest, { recursive: true }); return dest; }
const app = path.join(staging, 'data/usr/palm/applications', id);
fs.mkdirSync(app, { recursive: true });
fs.cpSync(path.join(root, 'app'), app, { recursive: true });
fs.cpSync(path.join(root, 'server'), path.join(app, 'server'), { recursive: true });
fs.mkdirSync(path.join(app, 'scripts'));
fs.copyFileSync(path.join(root, 'scripts/start-tv.sh'), path.join(app, 'scripts/start-tv.sh'));
const packageDir = path.join(staging, 'data/usr/palm/packages', id);
fs.mkdirSync(packageDir, { recursive: true });
fs.writeFileSync(path.join(packageDir, 'packageinfo.json'), JSON.stringify({ id, version: pkg.version, app: id }));
fs.mkdirSync(path.join(staging, 'control'));
function treeSize(dir) { return fs.readdirSync(dir, { withFileTypes: true }).reduce((size, e) => size + (e.isDirectory() ? treeSize(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0); }
fs.writeFileSync(path.join(staging, 'control/control'), `Package: ${id}\nVersion: ${pkg.version}\nSection: misc\nPriority: optional\nArchitecture: all\nInstalled-Size: ${treeSize(path.join(staging, 'data'))}\nMaintainer: VolKino\nDescription: Torrent search and streaming for webOS\nwebOS-Package-Format-Version: 2\nwebOS-Packager-Version: 1.0.0\n`);
fs.writeFileSync(path.join(staging, 'debian-binary'), '2.0\n');
execFileSync('tar', ['--format=ustar', '--owner=0', '--group=0', '-czf', path.join(staging, 'control.tar.gz'), '-C', path.join(staging, 'control'), 'control']);
execFileSync('tar', ['--format=ustar', '--owner=0', '--group=0', '-czf', path.join(staging, 'data.tar.gz'), '-C', path.join(staging, 'data'), './usr']);
const ipk = path.join(dest, `${pkg.name}_${pkg.version}_all.ipk`);
// webOS' verifier requires literal ar member names (no GNU ar trailing slash).
// Match ares-package: full regular-file mode 100644 and plain 16-byte names.
const members = [Buffer.from('!<arch>\n')];
for (const name of ['debian-binary', 'control.tar.gz', 'data.tar.gz']) {
  const data = fs.readFileSync(path.join(staging, name));
  const header = name.padEnd(16) + String(Math.floor(Date.now()/1000)).padEnd(12) + '0'.padEnd(6) + '0'.padEnd(6) + '100644'.padEnd(8) + String(data.length).padEnd(10) + '`\n';
  members.push(Buffer.from(header), data);
  if (data.length % 2) members.push(Buffer.from('\n'));
}
fs.writeFileSync(ipk, Buffer.concat(members));
fs.rmSync(staging, { recursive: true });
console.log(ipk);
