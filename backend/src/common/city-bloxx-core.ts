import { createRequire } from 'node:module';
import { join } from 'node:path';
import type * as Core from '../../.generated/core';

// Generated declarations stay inside backend; Nest's dist/src entry point stays stable.
const load = createRequire(__filename);
export const cityBloxxCore = load(
  join(__dirname, '../resources/city-bloxx/core.cjs'),
) as typeof Core;
