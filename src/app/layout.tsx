import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/context/WalletContext";
import Navbar from "@/components/Navbar";
import { Providers } from "@/app/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

const title = "GhostBook";
const description =
  "Confidential DEX on Flare Coston2. TEE-sealed swaps & orders, CipherSign vault, Uniswap V3 settlement — privacy where it matters, onchain where it must.";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#000000" },
  ],
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${title} — Confidential trading with Flare TEEs`,
    template: `%s · ${title}`,
  },
  description,
  applicationName: title,
  keywords: [
    "GhostBook",
    "Flare",
    "Coston2",
    "TEE",
    "FCC",
    "CipherSign",
    "privacy DEX",
    "sealed orders",
    "Uniswap V3",
    "confidential compute",
    "private swap",
  ],
  authors: [{ name: "GhostBook" }],
  creator: "GhostBook",
  publisher: "GhostBook",
  category: "finance",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  icons: {
    icon: [
      { url: "/icon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icon.png"],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: title,
    title: `${title} — Confidential trading with Flare TEEs`,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} — Confidential trading with Flare TEEs`,
    description,
  },  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title,
  },
  other: {
    "msapplication-TileColor": "#000000",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          <WalletProvider>
            <Navbar />
            <main className="pt-16 min-h-screen">{children}</main>
          </WalletProvider>
        </Providers>
      </body>
    </html>
  );
}
