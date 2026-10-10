import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Atkinson_Hyperlegible_Next, Literata, Newsreader, Schibsted_Grotesk } from "next/font/google";
import { BOOT_SCRIPT } from "@/lib/settings";
import "./globals.css";
import { Tooltips } from "@/components/ui/Tooltips";
import { ClerkProvider } from "@clerk/nextjs";
import { SyncAgent } from "@/components/account/SyncAgent";

const serif = Newsreader({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--nf-serif",
  display: "swap",
});

const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--nf-sans",
  display: "swap",
});

// Optional reading faces: declared here, fetched only when a reader picks them.
const book = Literata({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--nf-book",
  display: "swap",
  preload: false,
});

const legible = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--nf-legible",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3100");
const DESCRIPTION = "Highlight any line and ask it anything. An open model writes the answer in the margin, beside the words, citing the paragraphs it used.";
// The version busts the caches of X, Slack and LinkedIn, which keep a card image by its URL.
const OG = { url: "/og.png?v=2", width: 1200, height: 630, alt: "Gloss: highlight any line, ask it anything. Powered by Together AI." };

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Gloss", template: "%s" },
  description: DESCRIPTION,
  applicationName: "Gloss",
  openGraph: { type: "website", siteName: "Gloss", title: "Gloss", description: DESCRIPTION, url: "/", images: [OG] },
  twitter: { card: "summary_large_image", title: "Gloss", description: DESCRIPTION, images: [OG.url] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#151412" },
  ],
};

/** Clerk's sign-in and account screens, in the page's own ink and paper, in every theme. */
const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: "var(--ink)",
    colorBackground: "var(--bg-raised)",
    colorForeground: "var(--ink)",
    colorMutedForeground: "var(--ink-3)",
    colorInput: "var(--bg)",
    colorInputForeground: "var(--ink)",
    colorBorder: "var(--rule-strong)",
    colorNeutral: "var(--ink)",
    fontFamily: "var(--font-sans)",
    borderRadius: "12px",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${book.variable} ${legible.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <ClerkProvider appearance={CLERK_APPEARANCE}>
          {children}
          <SyncAgent />
        </ClerkProvider>
        <Tooltips />
        {/* Plausible: cookieless page views, from the production site only, so previews and local runs never count. */}
        {process.env.VERCEL_ENV === "production" && <Script defer data-domain="usegloss.io" src="https://plausible.io/js/script.js" strategy="afterInteractive" />}
      </body>
    </html>
  );
}
