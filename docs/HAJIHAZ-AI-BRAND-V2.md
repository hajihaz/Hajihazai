# HajiHaz AI — Signature H brand identity (10 November 2026)

## Chosen direction
Three concepts were compared at full size, 60 px, and 30 px: an H Core, a geometric H, and a neural H. The H Core won on small-size recognition, simplicity, and reproducibility. The final production artwork is a geometrically refined vector interpretation of that concept.

## Design system
- Ink: `#080A0F`
- Warm ivory: `#FFF9EF`
- Champagne gold core: `#DBB15D`
- The emblem is a rounded H with a single gold memory/intelligence core.
- The app icon has an opaque, edge-to-edge background; operating systems apply their own masks.
- The symbol lies within the central 80% square for Android adaptive/maskable safety.

## Canonical sources
- `public/branding/hajihaz-ai-mark-v2.svg`
- `public/branding/hajihaz-ai-mark-light-v2.svg`
- `public/branding/hajihaz-ai-wordmark-v2.svg`
- `scripts/generate-brand-assets.mjs` regenerates PNG versions from the SVGs.

## App integration
- `app/icon.png` serves the file-based Next favicon.
- `app/layout.tsx` specifies the versioned browser, Apple, and social art.
- `app/manifest.ts` specifies 192, 512, maskable PWA assets.
- `public/sw.js` caches the new URL-fingerprinted assets under v3.
- Legacy `hajihaz-mark*.png` and `hajihaz-logo.png` URLs remain available and now contain matching new branding.

## Acceptance
- Verify vector sources and generated sizes (16/32/180/192/512/1024).
- Run TypeScript, targeted brand and PWA tests, Next build, and deployed URL checks.
- On iOS, an already-installed home-screen shortcut may retain a cached icon after a deployment. Remove the old shortcut and use Safari Share → Add to Home Screen to see the new one.
- Do not apply this artwork to the separate HajiHaz personal workspace without its own brand decision.
