const fs = require('fs');
const path = require('path');

// Add shebang to CLI entry -- flags silence node:sqlite ExperimentalWarning
// and DEP0040 punycode warning from transitive deps.
const anyaPath = 'dist/bin/anya.js';
const shebang = '#!/usr/bin/env -S node --no-warnings=ExperimentalWarning --disable-warning=DEP0040';
let content = fs.readFileSync(anyaPath, 'utf8');
if (content.startsWith('#!')) {
  content = content.replace(/^#![^\n]*\n/, '');
}
fs.writeFileSync(anyaPath, shebang + '\n' + content);
fs.chmodSync(anyaPath, 0o755);

// Fix node:sqlite imports -- esbuild strips the node: prefix
function walkJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(fp));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(fp);
  }
  return out;
}
for (const fp of walkJs('dist')) {
  const c = fs.readFileSync(fp, 'utf8');
  if (c.includes('from "sqlite"')) {
    fs.writeFileSync(fp, c.replace(/from "sqlite"/g, 'from "node:sqlite"'));
    console.log('  Fixed node:sqlite import in', path.relative('dist', fp));
  }
}
