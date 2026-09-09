import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// systemd exposes this root-owned secret only to the service account.
const config = JSON.parse(readFileSync(join(process.env.CREDENTIALS_DIRECTORY, 'runtime'), 'utf8'));
for (const [key, value] of Object.entries(config)) {
  if (typeof value !== 'string') throw new Error(`Invalid runtime setting: ${key}`);
}
process.execve(process.execPath, [process.execPath, ...process.argv.slice(2)], {
  ...process.env,
  ...config,
});
