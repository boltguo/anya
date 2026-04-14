const fs = require('fs');
const path = require('path');

// Add shebang to CLI entry
const anyaPath = 'dist/bin/anya.js';
let content = fs.readFileSync(anyaPath, 'utf8');
if (!content.startsWith('#!')) {
  fs.writeFileSync(anyaPath, '#!/usr/bin/env -S node --no-warnings=ExperimentalWarning\n' + content);
}
fs.chmodSync(anyaPath, 0o755);

// Fix node:sqlite imports -- esbuild strips the node: prefix
const files = fs.readdirSync('dist').filter(f => f.endsWith('.js'));
for (const f of files) {
  const fp = path.join('dist', f);
  const c = fs.readFileSync(fp, 'utf8');
  if (c.includes('from "sqlite"')) {
    fs.writeFileSync(fp, c.replace(/from "sqlite"/g, 'from "node:sqlite"'));
    console.log('  Fixed node:sqlite import in', f);
  }
}
