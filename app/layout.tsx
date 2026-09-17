import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HajiHaz AI",
  description:
    "Next-generation AI assistant platform powered by memory, retrieval, and multi-model intelligence.",
  applicationName: "HajiHaz AI",
  openGraph: { title: "HajiHaz AI", description: "Personal intelligence with memory, live evidence, and specialized AI brains.", type: "website", images: [{ url: "/branding/hajihaz-logo.png", alt: "HajiHaz AI" }] },
  twitter: { card: "summary_large_image", title: "HajiHaz AI", description: "Personal intelligence with memory, live evidence, and specialized AI brains.", images: ["/branding/hajihaz-logo.png"] },
  icons: {
    icon: "/branding/hajihaz-mark.png",
    shortcut: "/branding/hajihaz-mark.png",
    apple: "/branding/hajihaz-mark.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

// Inline script runs before React hydration — reads localStorage and sets
// the .dark class immediately so there's no flash of wrong theme.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('hh-theme')||'system';if(t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh overflow-x-hidden antialiased">{children}</body>
    </html>
  );
}
