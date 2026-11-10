'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const storage = require('../server/storage');

test('storage queries the download filesystem before its directory exists', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'volkino-storage-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const destination = path.join(dir, 'not-created', 'downloads');
  const result = await storage.read(destination);
  assert(result.total > 0);
  assert(result.free >= 0 && result.free <= result.total);
  assert.equal(result.used, result.total - result.free);
  assert.equal(fs.existsSync(destination), false);
});

test('storage uses available blocks rather than blocks reserved for root', async t => {
  t.mock.method(fs, 'statfs', (target, callback) => callback(null, { blocks: 100, bsize: 1024, bfree: 40, bavail: 30 }));
  assert.deepEqual(await storage.read(os.tmpdir()), { total: 102400, free: 30720, used: 71680 });
});

test('old Node fallback handles wrapped df output and paths with spaces without a shell', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'volkino storage-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const originalStatfs = fs.statfs;
  fs.statfs = undefined;
  t.after(() => { fs.statfs = originalStatfs; });
  t.mock.method(childProcess, 'execFile', (file, args, options, callback) => {
    assert.equal(file, 'df');
    assert.deepEqual(args, ['-Pk', dir]);
    assert(options.timeout > 0);
    callback(null, 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/long-device-name\n  1000 400 500 45% /some mount\n');
  });
  assert.deepEqual(await storage.read(path.join(dir, 'downloads')), { total: 1024000, free: 512000, used: 512000 });
});

test('statfs errors fall back to df and a full disk reports zero free bytes', async t => {
  t.mock.method(fs, 'statfs', (target, callback) => callback(new Error('Unsupported')));
  t.mock.method(childProcess, 'execFile', (file, args, options, callback) => callback(null, 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/data 1000 1000 0 100% /data\n'));
  assert.deepEqual(await storage.read(os.tmpdir()), { total: 1024000, free: 0, used: 1024000 });
});

test('unavailable or invalid disk information is returned as null', async t => {
  const originalStatfs = fs.statfs;
  fs.statfs = undefined;
  t.after(() => { fs.statfs = originalStatfs; });
  const exec = t.mock.method(childProcess, 'execFile', (file, args, options, callback) => callback(new Error('Unavailable')));
  assert.equal(await storage.read(os.tmpdir()), null);
  exec.mock.mockImplementation((file, args, options, callback) => callback(null, 'invalid output'));
  assert.equal(await storage.read(os.tmpdir()), null);
  exec.mock.mockImplementation((file, args, options, callback) => callback(null, '/dev/data 1000 0 2000 0% /data\n'));
  assert.equal(await storage.read(os.tmpdir()), null);
});
