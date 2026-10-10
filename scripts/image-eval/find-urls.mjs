// Picks one recent, image-heavy article per publishing platform with Exa. Run once; the list is checked in.
// node --env-file-if-exists=.env.local scripts/image-eval/find-urls.mjs > scripts/image-eval/urls.json
const SITES = [
  ["latent.space", "Substack"], ["blog.bytebytego.com", "Substack"], ["oneusefulthing.org", "Substack (custom domain)"],
  ["medium.com", "Medium"], ["theverge.com", "Vox Media"], ["arstechnica.com", "WordPress (Condé)"],
  ["bbc.com", "BBC"], ["theguardian.com", "Guardian"], ["en.wikipedia.org", "Wikipedia"],
  ["nasa.gov", "NASA (WordPress)"], ["quantamagazine.org", "Quanta"], ["simonwillison.net", "Personal (Django)"],
  ["github.blog", "GitHub blog"], ["dev.to", "DEV"], ["smashingmagazine.com", "Smashing"],
  ["wired.com", "Wired"], ["anthropic.com", "Next.js company site"], ["vercel.com", "Next.js company blog"],
  ["blog.cloudflare.com", "Cloudflare blog"], ["ghost.org", "Ghost"], ["techcrunch.com", "WordPress"],
  ["apnews.com", "AP"], ["nature.com", "Nature"], ["every.to", "Every"], ["paulgraham.com", "No images (control)"],
];
const out = [];
for (const [domain, platform] of SITES) {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.EXA_API_KEY },
    body: JSON.stringify({ query: "an in-depth article with photos, charts or diagrams", type: "fast", numResults: 5, includeDomains: [domain] }),
  });
  const j = await res.json();
  // An article, not a section front: a path with some depth.
  const hit = (j.results ?? []).find((r) => { try { return new URL(r.url).pathname.split("/").filter(Boolean).length >= (domain === "paulgraham.com" ? 1 : 2); } catch { return false; } });
  if (hit) out.push({ platform, url: hit.url, title: hit.title });
  else console.error("no article for", domain);
}
console.log(JSON.stringify(out, null, 2));
