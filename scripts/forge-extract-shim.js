// Build-only shim (loaded via NODE_OPTIONS in the `package`/`make` scripts).
//
// Why: extract-zip@2 (used by electron-packager to unpack the Electron
// template) silently exits mid-extraction on Node 26 — the process ends 0
// with a partial tree and no error. This preload hook routes that single
// call through the system `unzip` binary instead; every other module loads
// normally. Revisit when the toolchain moves past the incompatibility:
// delete this file and drop the NODE_OPTIONS prefix from package.json.
const { execFileSync } = require('node:child_process');
const Module = require('node:module');

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'extract-zip') {
    return async (src, opts) => {
      execFileSync('unzip', ['-q', '-o', src, '-d', opts.dir], { stdio: 'pipe' });
    };
  }
  return origLoad.call(this, request, parent, isMain);
};
