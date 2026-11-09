import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HajiHaz AI",
    short_name: "HajiHaz",
    description: "Personal intelligence with memory, live evidence, and specialized AI brains.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    orientation: "any",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/branding/hajihaz-ai-mark-v2-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/branding/hajihaz-ai-mark-v2-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/branding/hajihaz-ai-mark-v2-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
