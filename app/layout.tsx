import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import PwaSetup from "@/components/PwaSetup";
import OrientationLock from "@/components/OrientationLock";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://nopostnow.com"),
  title: "NoPostNow",
  description: "A chronological photo feed without ads or algorithms",
  openGraph: {
    title: "NoPostNow",
    description: "A chronological photo feed. No algorithm and no ads.",
    url: "/",
    siteName: "NoPostNow",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NoPostNow",
    description: "A chronological photo feed. No algorithm and no ads.",
  },
  appleWebApp: {
    capable: true,
    title: "NoPostNow",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas text-white">
        <AuthProvider>{children}</AuthProvider>
        <PwaSetup />
        <OrientationLock />
      </body>
    </html>
  );
}
