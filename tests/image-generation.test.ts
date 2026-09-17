import { describe, expect, it } from "vitest";
import {
  buildImagePrompt,
  isImageAspectRatio,
  isImageSize,
} from "@/lib/ai/image-generation";

describe("image generation", () => {
  it("accepts supported aspect ratios and rejects arbitrary values", () => {
    expect(isImageAspectRatio("1:1")).toBe(true);
    expect(isImageAspectRatio("16:9")).toBe(true);
    expect(isImageAspectRatio("10:10")).toBe(false);
    expect(isImageAspectRatio(null)).toBe(false);
  });

  it("accepts supported quality sizes and rejects arbitrary values", () => {
    expect(isImageSize("1K")).toBe(true);
    expect(isImageSize("2K")).toBe(true);
    expect(isImageSize("4K")).toBe(true);
    expect(isImageSize("8K")).toBe(false);
  });

  it("preserves the user's brief while adding quality direction", () => {
    const prompt = buildImagePrompt("A black sports car on a rainy Tokyo street.");
    expect(prompt).toContain("A black sports car on a rainy Tokyo street.");
    expect(prompt).toContain("production-quality image");
    expect(prompt).toContain("strong composition");
    expect(prompt).toContain("Do not add watermarks");
  });
});
