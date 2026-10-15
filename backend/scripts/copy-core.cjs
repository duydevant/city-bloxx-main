const { cpSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const target = resolve(__dirname, '../dist/src/resources/city-bloxx');
mkdirSync(target, { recursive: true });
cpSync(resolve(__dirname, '../.generated'), target, { recursive: true });
