/** Every outbound URL in one place. */
export const BRAND = {
  /** The product name. Change it here and every screen follows. */
  name: "Marginalia",
  sarvamUrl: "https://www.sarvam.ai",
  keysUrl: "https://dashboard.sarvam.ai",
  modelsUrl: "https://www.sarvam.ai",
} as const;


/** The social card. The version busts the caches of X, Slack and LinkedIn, which keep a card image by its URL. */
export const OG_IMAGE = { url: "/og.jpg?v=3", width: 1200, height: 630, alt: `${BRAND.name}: highlight any line, ask it anything. Powered by Sarvam.` };

/** The public origin, for canonical, sitemap and social card URLs. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3100");
