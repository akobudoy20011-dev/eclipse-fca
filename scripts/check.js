'use strict';

const { spawnSync } = require('node:child_process');
const { readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');

function collectJavaScript(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory()
      ? collectJavaScript(path)
      : path.endsWith('.js') ? [path] : [];
  });
}

const files = ['index.js', ...collectJavaScript('src'), ...collectJavaScript('test'), ...collectJavaScript('scripts')];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
process.stdout.write(`Syntax check passed for ${files.length} JavaScript files.\n`);
