import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Flush Radar",
  description: "Skyll for å finne",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nb">
      <body className="antialiased bg-white text-black">
        <Suspense fallback={null}>{children}</Suspense>
        <script
          dangerouslySetInnerHTML={{
            __html: `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
  });
}
            `.trim(),
          }}
        />
      </body>
    </html>
  );
}
