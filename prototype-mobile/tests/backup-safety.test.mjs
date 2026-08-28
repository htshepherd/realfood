import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const execFileAsync = promisify(execFile);

async function executable(file, source) {
  await fs.writeFile(file, source);
  await fs.chmod(file, 0o755);
}

test("ordinary backup never initializes Restic and explicit bootstrap owns initialization", async () => {
  const [backup, bootstrap] = await Promise.all([
    fs.readFile(path.join(projectRoot, "ops", "backup.sh"), "utf8"),
    fs.readFile(path.join(projectRoot, "ops", "bootstrap-restic.sh"), "utf8"),
  ]);
  assert.match(backup, /restic cat config/);
  assert.doesNotMatch(backup, /restic init/);
  assert.match(bootstrap, /restic init/);
});

test("backup and restore use one exact snapshot-root database archive", async () => {
  const [backup, restore] = await Promise.all([
    fs.readFile(path.join(projectRoot, "ops", "backup.sh"), "utf8"),
    fs.readFile(path.join(projectRoot, "ops", "restore.sh"), "utf8"),
  ]);
  assert.match(backup, /cd "\$payload_dir"/);
  assert.match(backup, /restic backup postgres\.dump minio/);
  assert.match(restore, /dump_file="\$restore_dir\/postgres\.dump"/);
  assert.doesNotMatch(restore, /find .*postgres\.dump.*head/);
  assert.match(restore, /pg_restore --list "\$dump_file"/);
  assert.ok(restore.indexOf("pg_restore --list") < restore.indexOf('[ "$RESTORE_CONFIRM" = "I_UNDERSTAND" ]'));
});

test("backup image pins the base, Restic, and architecture-specific verified MinIO client", async () => {
  const dockerfile = await fs.readFile(path.join(projectRoot, "ops", "Dockerfile.backup"), "utf8");
  assert.match(dockerfile, /^ARG POSTGRES_IMAGE=postgres:16-alpine@sha256:[a-f0-9]{64}$/m);
  assert.match(dockerfile, /^FROM \$\{POSTGRES_IMAGE\}$/m);
  assert.match(dockerfile, /restic=0\.18\.1-r0/);
  assert.match(dockerfile, /MC_VERSION=RELEASE\.2025-07-21T05-28-08Z/);
  assert.match(dockerfile, /MC_SHA256_AMD64=[a-f0-9]{64}/);
  assert.match(dockerfile, /MC_SHA256_ARM64=[a-f0-9]{64}/);
  assert.match(dockerfile, /sha256sum -c/);
});

test("ordinary backup propagates repository errors without running init", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "realfood-backup-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin"); const log = path.join(root, "calls.log");
  await fs.mkdir(bin);
  await executable(path.join(bin, "restic"), `#!/bin/sh\necho "$*" >> "${log}"\n[ "$1 $2" = "cat config" ] && exit 42\nexit 0\n`);
  await assert.rejects(execFileAsync("sh", [path.join(projectRoot, "ops", "backup.sh")], { env: {
    ...process.env, PATH: `${bin}:${process.env.PATH}`, DATABASE_URL: "postgresql://invalid", MINIO_ACCESS_KEY: "x",
    MINIO_SECRET_KEY: "x", MINIO_BUCKET: "x", RESTIC_REPOSITORY: "s3:https://invalid", RESTIC_PASSWORD: "wrong",
  } }), (error) => error?.code === 42);
  assert.equal((await fs.readFile(log, "utf8")).trim(), "cat config");
});

test("explicit bootstrap is the only workflow that invokes restic init", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "realfood-bootstrap-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin"); const log = path.join(root, "calls.log");
  await fs.mkdir(bin);
  await executable(path.join(bin, "restic"), `#!/bin/sh\necho "$*" >> "${log}"\n`);
  await execFileAsync("sh", [path.join(projectRoot, "ops", "bootstrap-restic.sh")], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RESTIC_REPOSITORY: "local:test", RESTIC_PASSWORD: "test" } });
  assert.deepEqual((await fs.readFile(log, "utf8")).trim().split("\n"), ["init", "cat config"]);
});

test("restore ignores a decoy database archive inside the MinIO subtree", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "realfood-restore-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin"); const log = path.join(root, "calls.log");
  await fs.mkdir(bin);
  await executable(path.join(bin, "restic"), `#!/bin/sh\nwhile [ "$1" != "--target" ]; do shift; done\nshift\ntarget="$1"\nmkdir -p "$target/minio"\nprintf real > "$target/postgres.dump"\nprintf decoy > "$target/minio/postgres.dump"\n`);
  await executable(path.join(bin, "pg_restore"), `#!/bin/sh\necho "pg_restore $*" >> "${log}"\n`);
  await executable(path.join(bin, "mc"), `#!/bin/sh\necho "mc $*" >> "${log}"\n`);
  await execFileAsync("sh", [path.join(projectRoot, "ops", "restore.sh")], { env: {
    ...process.env, PATH: `${bin}:${process.env.PATH}`, RESTORE_SNAPSHOT: "snapshot", RESTORE_CONFIRM: "I_UNDERSTAND",
    DATABASE_URL: "postgresql://test", MINIO_ACCESS_KEY: "x", MINIO_SECRET_KEY: "x", MINIO_BUCKET: "x",
    RESTIC_REPOSITORY: "local:test", RESTIC_PASSWORD: "test",
  } });
  const calls = await fs.readFile(log, "utf8");
  assert.match(calls, /pg_restore --list \/tmp\/ihealth-restore\.[^/]+\/postgres\.dump/);
  assert.doesNotMatch(calls, /pg_restore .*\/minio\/postgres\.dump/);
});
