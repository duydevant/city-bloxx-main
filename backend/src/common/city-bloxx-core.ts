import { createRequire } from 'node:module';
import { join } from 'node:path';
import { cityBloxxResources } from './city-bloxx-resources';
import type * as Core from '../../.generated/core';

// Generated declarations stay inside backend; Nest's dist/src entry point stays stable.
const load = createRequire(__filename);
export const cityBloxxCore = load(join(cityBloxxResources, 'core.cjs')) as typeof Core;
