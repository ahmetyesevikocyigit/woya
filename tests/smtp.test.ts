import { test } from "node:test";
import assert from "node:assert/strict";
import { SMTPServer } from "smtp-server";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import * as tls from "node:tls";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import {
  mailConfigured,
  smtpFailure,
  smtpMessageId,
  sendMail,
} from "../lib/commerce/mail-transport";
import { sendAccountEmail } from "../lib/customer/email";

test("SMTP rejects missing credentials and distinguishes safe retries from ambiguous DATA", () => {
  process.env.EMAIL_TRANSPORT = "smtp";
  assert.equal(mailConfigured(), false);
  assert.equal(
    smtpFailure({ command: "CONN", code: "ETIMEDOUT" }).state,
    "retry",
  );
  assert.equal(
    smtpFailure({ command: "DATA", code: "ETIMEDOUT" }).state,
    "unknown",
  );
  assert.equal(
    smtpFailure({ command: "DATA", responseCode: 450 }).state,
    "retry",
  );
  assert.equal(
    smtpFailure({ command: "DATA", responseCode: 550 }).state,
    "failed",
  );
  assert.equal(smtpFailure({ code: "EAUTH" }).state, "failed");
  assert.equal(smtpMessageId("same"), smtpMessageId("same"));
  assert.notEqual(smtpMessageId("same"), smtpMessageId("different"));
});

test("Real TLS SMTP: account links, outbox retry, concurrent workers, crash ambiguity and certificate rejection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "woya-smtp-test-"));
  const keyPath = join(dir, "key.pem"),
    certPath = join(dir, "cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  );
  const cert = await readFile(certPath, "utf8");
  const oldCAs = tls.getCACertificates("default");
  tls.setDefaultCACertificates([...oldCAs, cert]);
  const messages: string[] = [];
  let mode = "ok",
    calls = 0;
  const smtp = new SMTPServer({
    secure: true,
    key: await readFile(keyPath),
    cert,
    onAuth(auth, _session, callback) {
      callback(
        auth.username === "test@example.test" && auth.password === "test-only"
          ? null
          : new Error("Invalid credentials"),
        { user: "test" },
      );
    },
    onData(stream, _session, callback) {
      calls++;
      let raw = "";
      stream.on("data", (chunk) => {
        raw += chunk.toString();
      });
      stream.on("end", () => {
        messages.push(raw);
        if (mode === "retry") {
          const e = Object.assign(new Error("Try later"), {
            responseCode: 450,
          });
          callback(e);
        } else callback(null, "Message accepted");
      });
    },
  });
  smtp.on("error", () => {});
  await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  const smtpPort = (smtp.server.address() as { port: number }).port;
  Object.assign(process.env, {
    EMAIL_TRANSPORT: "smtp",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtpPort),
    SMTP_SECURE: "true",
    SMTP_USER: "test@example.test",
    SMTP_PASSWORD: "test-only",
    CUSTOMER_EMAIL_FROM: "WOYA <test@example.test>",
    APP_URL: "https://woyatablo.com",
  });
  const net = createServer().listen(0, "127.0.0.1");
  await once(net, "listening");
  const pgPort = (net.address() as { port: number }).port;
  await new Promise<void>((resolve) => net.close(() => resolve()));
  const pg = new PGlite();
  const socket = new PGLiteSocketServer({
    db: pg,
    port: pgPort,
    host: "127.0.0.1",
    maxConnections: 4,
  });
  const { db } = await import("../lib/admin/db");
  const { deliverOne } = await import("../lib/commerce/worker");
  try {
    assert.equal(mailConfigured(), true);
    await sendAccountEmail("test@example.test", "a".repeat(64), "verify");
    assert.match(messages[0], /profil\/dogrula#token=/);
    for (const name of [
      "001-admin.sql",
      "002-admin-security.sql",
      "003-paytr.sql",
      "004-customer-accounts.sql",
      "005-commerce.sql",
    ])
      await pg.exec(await readFile(`db/${name}`, "utf8"));
    await socket.start();
    process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${pgPort}/postgres`;
    const id = randomUUID(),
      eventKey = `smtp:${id}`;
    const payload = {
      from: "WOYA <test@example.test>",
      to: ["test@example.test"],
      subject: "WOYA SMTP test",
      text: "Frozen message",
    };
    await pg.query(
      "INSERT INTO woya_email_outbox(id,event_key,payload) VALUES($1,$2,$3)",
      [id, eventKey, JSON.stringify(payload)],
    );
    const state = async () =>
      (await pg.query<{ state: string }>("SELECT state FROM woya_email_outbox"))
        .rows[0].state;
    mode = "retry";
    await deliverOne();
    assert.equal(await state(), "retry");
    await pg.exec(
      "UPDATE woya_email_outbox SET next_attempt_at=now()-interval '1 minute'",
    );
    mode = "ok";
    await Promise.all([deliverOne(), deliverOne()]);
    assert.equal(await state(), "sent");
    assert.equal(calls, 3); // account + rejected attempt + one accepted retry
    assert.ok(messages[1].includes(smtpMessageId(eventKey)));
    assert.ok(messages[2].includes(smtpMessageId(eventKey)));
    assert.equal(await deliverOne(), false);
    await pg.exec(
      "UPDATE woya_email_outbox SET state='sending',lease_until=now()-interval '1 minute'",
    );
    await deliverOne();
    assert.equal(await state(), "unknown");
    assert.equal(calls, 3, "expired SMTP lease is never sent again");
    tls.setDefaultCACertificates(oldCAs);
    const rejected = await sendMail(payload, "untrusted-cert");
    assert.notEqual(rejected.state, "sent");
    assert.equal(
      calls,
      3,
      "untrusted TLS certificate blocks mail transmission",
    );
  } finally {
    tls.setDefaultCACertificates(oldCAs);
    await db().end();
    delete (globalThis as { woyaSql?: unknown }).woyaSql;
    await socket.stop();
    await pg.close();
    await new Promise<void>((resolve) => smtp.close(resolve));
    await rm(dir, { recursive: true, force: true });
    for (const key of [
      "EMAIL_TRANSPORT",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_SECURE",
      "SMTP_USER",
      "SMTP_PASSWORD",
      "DATABASE_URL",
    ])
      delete process.env[key];
  }
});
