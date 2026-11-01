import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

// Backend settings only. Existing process variables take precedence.
const file = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(file)) loadEnvFile(file);
