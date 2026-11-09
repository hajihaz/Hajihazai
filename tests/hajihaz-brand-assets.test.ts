import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const asset = (name: string) => resolve(process.cwd(), name);

describe("HajiHaz AI Signature H identity", () => {
  it.each([
    ["public/branding/hajihaz-ai-mark-v2-16.png", 16, 16],
    ["public/branding/hajihaz-ai-mark-v2-32.png", 32, 32],
    ["public/branding/hajihaz-ai-mark-v2-180.png", 180, 180],
    ["public/branding/hajihaz-ai-mark-v2-192.png", 192, 192],
    ["public/branding/hajihaz-ai-mark-v2-512.png", 512, 512],
    ["public/branding/hajihaz-ai-mark-v2-maskable.png", 512, 512],
    ["public/branding/hajihaz-ai-mark-v2-1024.png", 1024, 1024],
    ["public/branding/hajihaz-ai-mark-light-v2-512.png", 512, 512],
    ["app/icon.png", 512, 512],
    ["public/apple-touch-icon.png", 180, 180],
    ["public/branding/hajihaz-ai-wordmark-v2.png", 1200, 630],
  ])("produces %s with correct dimensions", async (name, width, height) => {
    const metadata = await sharp(asset(name)).metadata();
    expect(metadata.width).toBe(width);
    expect(metadata.height).toBe(height);
    expect(metadata.format).toBe("png");
  });

  it("has a solid dark edge, an ivory monogram, and a gold central core", async () => {
    const img = sharp(asset("public/branding/hajihaz-ai-mark-v2-512.png")).ensureAlpha();
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const n = (y * info.width + x) * info.channels;
      return [...data.subarray(n, n + 4)];
    };
    expect(pixel(0, 0)).toEqual([8, 10, 15, 255]); // opaque full-bleed background
    expect(pixel(512 / 2, 512 / 2)).toEqual([219, 177, 93, 255]); // gold core
    expect(pixel(140, 160)).toEqual([255, 249, 239, 255]); // ivory H pillar
  });

  it("keeps source vectors and regenerated PNGs in sync", async () => {
    const svg = await readFile(asset("public/branding/hajihaz-ai-mark-v2.svg"), "utf8");
    expect(svg).toContain('viewBox="0 0 1024 1024"');
    expect(svg).toContain("#DBB15D");
    const nextIcon = await readFile(asset("app/icon.png"));
    const mark = await readFile(asset("public/branding/hajihaz-ai-mark-v2-512.png"));
    expect(nextIcon.equals(mark)).toBe(true);
  });
});
