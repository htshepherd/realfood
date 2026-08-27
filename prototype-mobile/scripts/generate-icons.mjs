import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const publicRoot = path.resolve("public");
const icon = await fs.readFile(path.join(publicRoot, "icon.svg"));
const maskable = await fs.readFile(path.join(publicRoot, "icon-maskable.svg"));
await Promise.all([
  sharp(icon).resize(180, 180).png().toFile(path.join(publicRoot, "apple-touch-icon.png")),
  sharp(icon).resize(192, 192).png().toFile(path.join(publicRoot, "icon-192.png")),
  sharp(icon).resize(512, 512).png().toFile(path.join(publicRoot, "icon-512.png")),
  sharp(maskable).resize(512, 512).png().toFile(path.join(publicRoot, "icon-maskable-512.png")),
]);
console.log("PWA 与 iPhone 主屏幕图标已生成");
