#!/usr/bin/env node
// Adds missing package.json imports required for SPA build
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '../node_modules/@tanstack/start-server-core/package.json');

if (!fs.existsSync(pkgPath)) {
  console.log('patch-tanstack: package not found, skipping');
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.imports = pkg.imports || {};
pkg.imports['#tanstack-router-entry'] = { default: './dist/esm/empty-plugin-adapters.js' };
pkg.imports['#tanstack-start-entry'] = { default: './dist/esm/empty-plugin-adapters.js' };
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log('patch-tanstack: applied successfully');
