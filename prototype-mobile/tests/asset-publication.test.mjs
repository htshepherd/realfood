import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyAssetManifest, verifyManifestDirectory } from "../scripts/asset-publication.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("publication accepts exactly the manifest allowlist and rejects extras or changed bytes", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "realfood-publish-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const original = Buffer.from("png");
  const optimized = Buffer.from("webp");
  await fs.mkdir(path.join(root, "food-images", "optimized"), { recursive: true });
  await fs.writeFile(path.join(root, "food-images", "apple.png"), original);
  await fs.writeFile(path.join(root, "food-images", "optimized", "apple.webp"), optimized);
  const items = [{
    key: "food-images/apple.png", bytes: original.length, checksum: sha256(original), mediaType: "image/png",
    optimized: { key: "food-images/optimized/apple.webp", bytes: optimized.length, checksum: sha256(optimized), mediaType: "image/webp" },
  }];

  const manifest = { count: items.length, items, checksum: sha256(JSON.stringify(items)) };
  assert.equal(verifyAssetManifest(manifest), items);
  assert.throws(() => verifyAssetManifest({ ...manifest, items: [{ ...items[0], bytes: 99 }] }), /身份校验失败/);

  assert.equal((await verifyManifestDirectory(root, items)).length, 2);
  await fs.writeFile(path.join(root, "food-images", "extra.png"), original);
  await assert.rejects(verifyManifestDirectory(root, items), /未列入资源清单/);
  await fs.rm(path.join(root, "food-images", "extra.png"));
  await fs.writeFile(path.join(root, "food-images", "apple.png"), Buffer.from("changed"));
  await assert.rejects(verifyManifestDirectory(root, items), /资源校验失败/);
});
