'use strict';
// Query the filesystem holding downloads, including before the first save.
// statfs is unavailable on older Node.js versions shipped on TVs.
var fs = require('fs'), path = require('path'), childProcess = require('child_process');
exports.read = function (directory) {
  return new Promise(function (resolve) {
    var target = path.resolve(directory);
    while (!fs.existsSync(target) && path.dirname(target) !== target) target = path.dirname(target);
    function result(total, free) {
      if (!isFinite(total) || !isFinite(free) || total <= 0 || free < 0 || free > total) return resolve(null);
      resolve({total:total, free:free, used:total - free});
    }
    function fallback() {
      childProcess.execFile('df', ['-Pk', target], {timeout:1500, maxBuffer:65536, env:Object.assign({}, process.env, {LC_ALL:'C'})}, function (error, stdout) {
        if (error) return resolve(null);
        var match = /(?:^|\n)[^\n]*?\s+(\d+)\s+\d+\s+(\d+)\s+\d+%\s+/.exec(stdout);
        if (!match) return resolve(null);
        result(Number(match[1]) * 1024, Number(match[2]) * 1024);
      });
    }
    if (typeof fs.statfs !== 'function') return fallback();
    fs.statfs(target, function (error, stat) {
      if (error) return fallback();
      result(stat.blocks * stat.bsize, stat.bavail * stat.bsize);
    });
  });
};
