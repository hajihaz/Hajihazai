/**
 * HajiHaz AI Signature H: deterministic, vector-first brand asset generation.
 * Run: node scripts/generate-brand-assets.mjs
 * Canonical SVGs live in public/branding; never upscale raster art.
 */
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const base = "public/branding";
const dark = await readFile(`${base}/hajihaz-ai-mark-v2.svg`);
const light = await readFile(`${base}/hajihaz-ai-mark-light-v2.svg`);
const wordmark = await readFile(`${base}/hajihaz-ai-wordmark-v2.svg`);

async function png(source, size, target) {
  await sharp(source, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(target);
}
for (const size of [16, 32, 48, 180, 192, 512, 1024]) {
  await png(dark, size, `${base}/hajihaz-ai-mark-v2-${size}.png`);
}
await png(light, 512, `${base}/hajihaz-ai-mark-light-v2-512.png`);
await png(light, 1024, `${base}/hajihaz-ai-mark-light-v2-1024.png`);

// Monogram is completely inside the central 80% maskable safe zone.
await png(dark, 512, `${base}/hajihaz-ai-mark-v2-maskable.png`);
await png(dark, 512, `${base}/hajihaz-mark.png`); // legacy URL fallback
await png(dark, 192, `${base}/hajihaz-mark-192.png`); // legacy URL fallback
await png(dark, 512, "app/icon.png"); // Next.js file-based icon route
await png(dark, 180, "public/apple-touch-icon.png");
await sharp(wordmark, { density: 192 })
  .resize(1200, 630)
  .png({ compressionLevel: 9 })
  .toFile(`${base}/hajihaz-ai-wordmark-v2.png`);
// Replace legacy social logo to prevent stale old head artwork.
await sharp(wordmark, { density: 192 })
  .resize(1200, 630)
  .png({ compressionLevel: 9 })
  .toFile(`${base}/hajihaz-logo.png`);
console.log("HajiHaz AI Signature H assets generated.");
