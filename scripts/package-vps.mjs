import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const stageDir = path.join(distDir, "woya-vps-standalone");
const archivePath = path.join(distDir, "woya-vps-standalone.tar.gz");
const standaloneDir = path.join(root, ".next", "standalone");
const staticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");
const forbiddenReleasePaths = [
  ".env",
  ".git",
  ".next/cache",
  "dist",
  "outputs",
  "tests",
  "work",
];

function copyDirectory(source, target) {
  if (!existsSync(source)) {
    throw new Error(
      `${path.relative(root, source)} bulunamadı. Önce pnpm build çalıştırın.`,
    );
  }
  cpSync(source, target, {
    dereference: false,
    verbatimSymlinks: true,
    errorOnExist: false,
    force: true,
    recursive: true,
  });
}

async function directorySize(dir) {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(next);
    } else if (entry.isFile()) {
      total += statSync(next).size;
    }
  }
  return total;
}

function removeForbiddenReleasePaths() {
  for (const relativePath of forbiddenReleasePaths) {
    rmSync(path.join(stageDir, relativePath), { force: true, recursive: true });
  }
  for (const entry of readdirSync(stageDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".env")) {
      rmSync(path.join(stageDir, entry.name), { force: true, recursive: true });
    }
  }
}

async function forbiddenEntries(dir = stageDir, prefix = "") {
  const matches = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (
      entry.name.startsWith(".env") ||
      forbiddenReleasePaths.some(
        (forbiddenPath) =>
          relativePath === forbiddenPath ||
          relativePath.startsWith(`${forbiddenPath}/`),
      )
    ) {
      matches.push(relativePath);
      continue;
    }
    if (entry.isDirectory()) {
      matches.push(
        ...(await forbiddenEntries(path.join(dir, entry.name), relativePath)),
      );
    }
  }
  return matches;
}

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function main() {
  if (!existsSync(path.join(standaloneDir, "server.js"))) {
    throw new Error(
      ".next/standalone/server.js bulunamadı. next.config.mjs içinde output: 'standalone' ile pnpm build çalıştırın.",
    );
  }

  rmSync(stageDir, { force: true, recursive: true });
  rmSync(archivePath, { force: true });
  mkdirSync(path.join(stageDir, ".next"), { recursive: true });

  copyDirectory(standaloneDir, stageDir);
  removeForbiddenReleasePaths();
  copyDirectory(staticDir, path.join(stageDir, ".next", "static"));
  copyDirectory(publicDir, path.join(stageDir, "public"));
  removeForbiddenReleasePaths();

  const manifest = [
    "WOYA VPS standalone paketi",
    "",
    "Çalıştırma:",
    "  cd /opt/woya/current",
    "  PORT=3000 HOSTNAME=127.0.0.1 node server.js",
    "",
    "Kopyalanmayanlar:",
    "  .env*",
    "  .git",
    "  node_modules tamamı (yalnızca Next standalone trace içindeki runtime paketleri kalır)",
    "  .next/cache",
    "  work",
    "  tests",
    "",
    "Ortam değişkenlerini VPS'te release dışında tutun, örn. /etc/woya/woya.env.",
    "Kalıcı yükleme klasörünü release dışında tutun, örn. /var/lib/woya/uploads.",
    "",
  ].join("\n");
  await writeFile(path.join(stageDir, "VPS_README.txt"), manifest);

  copyDirectory(path.join(root, "db"), path.join(stageDir, "db"));
  const revision =
    process.env.GITHUB_SHA ||
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  if (!/^[a-f0-9]{40}$/.test(revision))
    throw new Error("Invalid release revision");
  await writeFile(path.join(stageDir, "REVISION"), revision + "\n");
  const forbidden = await forbiddenEntries();
  if (forbidden.length) {
    throw new Error(
      `VPS paketine girmemesi gereken dosya bulundu: ${forbidden.slice(0, 12).join(", ")}`,
    );
  }

  // Preserve package-relative links so pnpm dependency resolution stays intact.
  // CI and the VPS validate every link stays inside this exact archive.
  execFileSync(
    "python3",
    [
      "-c",
      "import sys,tarfile; t=tarfile.open(sys.argv[2],'w:gz',dereference=False); t.add(sys.argv[1],arcname='.'); t.close()",
      stageDir,
      archivePath,
    ],
    {
      cwd: root,
      stdio: "inherit",
    },
  );

  const bytes = await readFile(archivePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(
    `${archivePath}.sha256`,
    `${sha256}  ${path.basename(archivePath)}\n`,
  );

  const stageSize = await directorySize(stageDir);
  console.log(`VPS paketi hazır: ${path.relative(root, archivePath)}`);
  console.log(`Paket boyutu: ${formatMb(bytes.length)}`);
  console.log(`Açılmış boyut: ${formatMb(stageSize)}`);
  console.log(`SHA256: ${sha256}`);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "VPS paketi oluşturulamadı.",
  );
  process.exitCode = 1;
});
