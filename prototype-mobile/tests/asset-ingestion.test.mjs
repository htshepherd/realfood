import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { buildAssetManifest } from "../scripts/knowledge-compiler.mjs";
import { safeReportCode } from "../src/server/safe-files.mjs";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "realfood-assets-"));
  const active = path.join(root, "active");
  const candidate = path.join(root, "candidate");
  await Promise.all(["food-images", "knowledge-images", "verification-images"].map((name) => fs.mkdir(path.join(active, name), { recursive: true })));
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "#123456" } }).png().toBuffer();
  await fs.writeFile(path.join(active, "food-images", "apple.png"), png);
  return { root, active, candidate, png };
}

test("candidate asset generation does not mutate the active tree", async (t) => {
  const { root, active, candidate } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const before = await fs.readFile(path.join(active, "food-images", "apple.png"));
  const manifest = await buildAssetManifest(active, { outputRoot: candidate });

  assert.deepEqual(await fs.readFile(path.join(active, "food-images", "apple.png")), before);
  await assert.rejects(fs.access(path.join(active, "food-images", "optimized", "apple.webp")));
  const canonicalPng = await fs.readFile(path.join(candidate, "food-images", "apple.png"));
  assert.equal((await sharp(canonicalPng).metadata()).format, "png");
  await fs.access(path.join(candidate, "food-images", "optimized", "apple.webp"));
  assert.equal(manifest.items[0].mediaType, "image/png");
  assert.equal(manifest.items[0].optimized.mediaType, "image/webp");
});

test("asset ingestion rejects symlinks, hard links, SVG, and unsafe names", async (t) => {
  const cases = [
    async ({ root, active, png }) => {
      const outside = path.join(root, "outside.png");
      await fs.writeFile(outside, png);
      await fs.symlink(outside, path.join(active, "food-images", "linked.png"));
    },
    async ({ root, active }) => {
      const outside = path.join(root, "outside-optimized");
      await fs.mkdir(outside);
      await fs.symlink(outside, path.join(active, "food-images", "optimized"));
    },
    async ({ root, active, png }) => {
      const outside = path.join(root, "outside-food-images");
      await fs.mkdir(outside);
      await fs.writeFile(path.join(outside, "apple.png"), png);
      await fs.rm(path.join(active, "food-images"), { recursive: true });
      await fs.symlink(outside, path.join(active, "food-images"));
    },
    async ({ active }) => fs.link(path.join(active, "food-images", "apple.png"), path.join(active, "food-images", "hard.png")),
    async ({ active }) => fs.writeFile(path.join(active, "food-images", "script.svg"), "<svg><script>alert(1)</script></svg>"),
    async ({ active }) => fs.writeFile(path.join(active, "food-images", "bad\u001b[2J.png"), "x"),
  ];

  for (const arrange of cases) {
    const context = await fixture();
    t.after(() => fs.rm(context.root, { recursive: true, force: true }));
    await arrange(context);
    await assert.rejects(buildAssetManifest(context.active, { outputRoot: context.candidate }));
  }
});

test("publication report renders untrusted names inside escaped HTML code", () => {
  assert.equal(safeReportCode('name`<img src=x onerror="alert(1)">.md'), '<code>name`&lt;img src=x onerror=&quot;alert(1)&quot;&gt;.md</code>');
  assert.throws(() => safeReportCode("name\u001b[2J.md"));
});
