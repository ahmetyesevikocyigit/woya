import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const cwd = resolve(process.argv[2]);
const revision = (await readFile(resolve(cwd, "REVISION"), "utf8")).trim();
assert.match(revision, /^[a-f0-9]{40}$/);
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: "3199",
  HOSTNAME: "127.0.0.1",
  DATABASE_URL: "",
  CUSTOMER_AUTH_SECRET: "",
};
const server = spawn(process.execPath, ["server.js"], {
  cwd,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stdout.on("data", (b) => (output += b));
server.stderr.on("data", (b) => (output += b));
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (server.exitCode !== null)
      throw new Error("Packaged server exited: " + output);
    try {
      const r = await fetch("http://127.0.0.1:3199/api/hesap/session", {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) {
        assert.equal((await r.json()).customer, null);
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready, "Packaged server did not become ready: " + output);
  const page = await fetch("http://127.0.0.1:3199/profil/kayit");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Kayıt ol/);
  console.log("Extracted standalone archive boots and serves account page");
} finally {
  server.kill("SIGTERM");
}
