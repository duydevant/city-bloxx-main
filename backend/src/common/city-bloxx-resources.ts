import { join } from 'node:path';

// Source runners (Jest/ts-node) consume build:core output. Packaged JS only uses
// its colocated runtime artifacts and never falls back to checkout files.
export const cityBloxxResources = __filename.endsWith('.ts')
  ? join(__dirname, '../../.generated')
  : join(__dirname, '../resources/city-bloxx');
