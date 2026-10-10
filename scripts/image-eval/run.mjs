// Image eval: does importing a link keep the article's pictures, and do they load?
//
// For each URL in urls.json:
//   reference  open the original page in headless Chrome, scroll through it so lazy images load,
//              and count the content pictures (at least 200px wide, outside header, nav and footer)
//   kept       import it through Gloss (/api/import) and count the figure blocks
//   loads      fetch each kept picture the way the reader does (no referrer) and check it is an image
//
// Needs the app running (npm run dev) and Google Chrome.
// node scripts/image-eval/run.mjs [baseUrl] [--keep-reference] > scripts/image-eval/results.md
// --keep-reference reuses the page counts from the last results.json and skips Chrome: a quick rerun after an importer change.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const BASE = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3100";
const KEEP = args.includes("--keep-reference");
const previous = KEEP ? Object.fromEntries(JSON.parse(readFileSync(new URL("./results.json", import.meta.url), "utf8")).map((r) => [r.url, r.reference])) : {};
const URLS = JSON.parse(readFileSync(new URL("./urls.json", import.meta.url), "utf8"));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- a minimal Chrome DevTools driver, started only when page counts are needed ---------- */
let chrome, ws, send, evaluate;
async function startChrome() {
  const profile = mkdtempSync(join(tmpdir(), "gloss-image-eval-"));
  chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9341", `--user-data-dir=${profile}`, "--hide-scrollbars", `--user-agent=${UA}`, "about:blank"], { stdio: "ignore" });
    for (let i = 0; i < 60 && !ws; i++) {
    try {
      const page = (await (await fetch("http://127.0.0.1:9341/json")).json()).find((t) => t.type === "page");
      if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
    } catch {}
    await sleep(250);
  }
  // The socket may already be open by now: only wait when it is still connecting.
  if (ws.readyState !== WebSocket.OPEN) await new Promise((r) => ws.addEventListener("open", r));
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) (pending.get(m.id))(m.result), pending.delete(m.id);
  });
  send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout: 40000 })).result?.value;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

}
const within = (ms, p) => Promise.race([p, sleep(ms).then(() => { throw new Error("timed out"); })]);
if (!KEEP) await startChrome();

/** Content pictures on the live page, after scrolling through it so lazy ones load. */
async function reference(url) {
  await send("Page.navigate", { url });
  await sleep(6000);
  return evaluate(`(async () => {
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    // At most about 25 screens, so an infinite feed under the article cannot keep it scrolling.
    for (let y = 0, n = 0; y < document.body.scrollHeight && n < 25; y += 700, n++) { window.scrollTo(0, y); await pause(180); }
    await pause(1500);
    const roots = [...document.querySelectorAll("article, main, [role=main]")];
    const root = roots.sort((a, b) => b.innerText.length - a.innerText.length)[0] ?? document.body;
    const seen = new Set();
    for (const img of root.querySelectorAll("img")) {
      if (img.closest("header, nav, footer, aside, [role=banner], [role=navigation], [role=contentinfo]")) continue;
      const r = img.getBoundingClientRect();
      if (r.width < 200 || img.naturalWidth < 200) continue;
      seen.add(img.currentSrc || img.src);
    }
    return { count: seen.size, title: document.title.slice(0, 80) };
  })()`);
}

/** What Gloss keeps, and whether each kept picture loads without a referrer. */
async function gloss(url) {
  const res = await fetch(`${BASE}/api/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.article) return { error: j.error ?? `HTTP ${res.status}` };
  const figures = j.article.blocks.filter((b) => b.type === "figure");
  const failures = [];
  let loads = 0;
  for (const f of figures) {
    try {
      const r = await fetch(f.src, { headers: { "User-Agent": UA, Accept: "image/*" }, signal: AbortSignal.timeout(15000) });
      const type = r.headers.get("content-type") ?? "";
      if (r.ok && type.startsWith("image/")) loads++;
      else failures.push(`${r.status} ${type} ${f.src.slice(0, 100)}`);
    } catch (e) {
      failures.push(`${String(e).slice(0, 40)} ${f.src.slice(0, 100)}`);
    }
  }
  return { kept: figures.length, loads, failures, blocks: j.article.blocks.length };
}

const rows = [];
for (const { platform, url } of URLS) {
  const ref = KEEP ? { count: previous[url] ?? null } : await within(60000, reference(url)).catch((e) => ({ count: null, error: String(e) }));
  const g = await within(90000, gloss(url)).catch((e) => ({ error: String(e) }));
  rows.push({ platform, url, reference: ref?.count ?? null, ...g });
  console.error(`${platform.padEnd(24)} ref ${String(ref?.count ?? "?").padStart(3)}  kept ${String(g.kept ?? "-").padStart(3)}  loads ${String(g.loads ?? "-").padStart(3)}  ${g.error ?? ""}`);
}
ws?.close();
chrome?.kill();
writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(rows, null, 2) + "\n");

/* ---------- the report ---------- */
const verdict = (r) => {
  if (r.error) return `import failed: ${r.error}`;
  if (r.kept === 0 && !r.reference) return "no pictures, none expected";
  if (r.kept === 0) return "lost every picture";
  if (r.loads < r.kept) return `${r.kept - r.loads} kept but broken`;
  if (r.reference != null && r.kept < r.reference) return `kept ${r.kept} of ${r.reference}`;
  return "good";
};
const lines = [
  "| Platform | Page pictures | Gloss kept | Load | Verdict | Article |",
  "|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.platform} | ${r.reference ?? "?"} | ${r.kept ?? "-"} | ${r.loads ?? "-"} | ${verdict(r)} | ${r.url} |`),
];
const broken = rows.flatMap((r) => (r.failures ?? []).map((f) => `- ${r.platform}: ${f}`));
console.log(lines.join("\n") + (broken.length ? `\n\nPictures kept that did not load:\n${broken.join("\n")}` : "") + "\n");
