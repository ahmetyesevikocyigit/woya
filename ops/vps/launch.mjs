import { existsSync } from 'node:fs';
// Allows rollback to the prior source-based release as well as new standalone releases.
const args=existsSync('server.js') ? ['server.js'] : ['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',process.env.PORT];
process.execve(process.execPath,[process.execPath,...args],process.env);
