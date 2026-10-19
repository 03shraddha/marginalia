/* Marginalia - a browser-only reader with an AI scholar in the margin.
   No server: your key stays in localStorage and goes only to your configured endpoint. */

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};

const DEFAULTS = { apiKey: "", baseUrl: "https://api.sarvam.ai/v1", model: "sarvam-m" };
let settings = { ...DEFAULTS, ...store.get("marginalia.settings", {}) };
let doc = store.get("marginalia.doc", null); // {title, paragraphs: []}
let notes = store.get("marginalia.notes", []); // {pIndex, quote, question, answer, loading?, error?}
let highlights = store.get("marginalia.highlights", []); // {pIndex, quote}

// A note saved while its answer was still loading would animate forever: nothing
// resumes the request after a reload. Mark it interrupted so it can be retried.
for (const n of notes) {
  if (n.loading) {
    n.loading = false;
    if (!n.answer) n.error = "This answer got interrupted when the page reloaded. Ask again to retry.";
  }
}
let pendingSel = null; // {pIndex, quote}

/* ---------- Settings ---------- */
function openSettings() {
  $("setKey").value = settings.apiKey;
  $("setBase").value = settings.baseUrl;
  $("setModel").value = settings.model;
  $("settingsModal").hidden = false;
}
$("settingsBtn").onclick = openSettings;
$("setClose").onclick = () => ($("settingsModal").hidden = true);
$("setSave").onclick = () => {
  settings = {
    apiKey: $("setKey").value.trim(),
    baseUrl: ($("setBase").value.trim() || DEFAULTS.baseUrl).replace(/\/+$/, ""),
    model: $("setModel").value.trim() || DEFAULTS.model,
  };
  store.set("marginalia.settings", settings);
  $("settingsModal").hidden = true;
};

/* ---------- Import ---------- */
function setDoc(title, text) {
  const paragraphs = String(text)
    .split(/\n\s*\n|\r?\n(?=\S)/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 1);
  if (!paragraphs.length) return false;
  doc = { title: title || "Untitled", paragraphs };
  notes = [];
  highlights = [];
  persist();
  render();
  return true;
}
function persist() {
  store.set("marginalia.doc", doc);
  store.set("marginalia.notes", notes);
  store.set("marginalia.highlights", highlights);
}

$("pasteGo").onclick = () => {
  const t = $("pasteInput").value.trim();
  if (!t) return;
  const firstLine = t.split("\n")[0].trim();
  setDoc(firstLine.length < 120 ? firstLine : "Pasted text", t);
};

$("urlGo").onclick = async () => {
  const url = $("urlInput").value.trim();
  if (!url) return;
  const st = $("urlStatus");
  st.classList.remove("error");
  st.textContent = "Fetching article...";
  try {
    const res = await fetch("https://r.jina.ai/" + url);
    if (!res.ok) throw new Error("reader returned HTTP " + res.status);
    let text = await res.text();
    let title = "";
    const m = text.match(/^Title:\s*(.+)$/m);
    if (m) title = m[1].trim();
    text = text
      .replace(/^Title:.*$/m, "")
      .replace(/^URL Source:.*$/m, "")
      .replace(/^Markdown Content:\s*$/m, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/(?<!\d)\*([^*\n]+)\*/g, "$1")
      .replace(/^\s*[-*•]\s+/gm, "");
    if (!setDoc(title, text)) throw new Error("no readable text found");
    st.textContent = "";
  } catch (e) {
    st.classList.add("error");
    st.textContent = "Could not read that link (" + e.message + "). Try pasting the text instead.";
  }
};

/* PDF via pdf.js from CDN */
async function readPdf(file) {
  const st = $("pdfStatus");
  st.classList.remove("error");
  st.textContent = "Reading PDF...";
  try {
    const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/build/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/build/pdf.worker.min.mjs";
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    let out = [];
    const maxPages = Math.min(pdf.numPages, 80);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      let line = "";
      let lastY = null;
      for (const item of tc.items) {
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) { out.push(line); line = ""; }
        line += item.str + (item.str.endsWith(" ") ? "" : " ");
        lastY = y;
      }
      if (line.trim()) out.push(line);
      out.push("");
    }
    const name = file.name.replace(/\.pdf$/i, "");
    if (!setDoc(name, out.join("\n"))) throw new Error("no text layer found (scanned PDF?)");
    st.textContent = "";
  } catch (e) {
    st.classList.add("error");
    st.textContent = "Could not read that PDF: " + e.message;
  }
}
$("pdfInput").onchange = (e) => e.target.files[0] && readPdf(e.target.files[0]);
const dz = $("dropzone");
dz.ondragover = (e) => { e.preventDefault(); dz.classList.add("over"); };
dz.ondragleave = () => dz.classList.remove("over");
dz.ondrop = (e) => {
  e.preventDefault();
  dz.classList.remove("over");
  const f = e.dataTransfer.files[0];
  if (f) readPdf(f);
};

/* ---------- Render ---------- */
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function paragraphHtml(pIndex, text) {
  let html = esc(text);
  for (const h of highlights.filter((x) => x.pIndex === pIndex)) {
    const q = esc(h.quote);
    const i = html.indexOf(q);
    if (i >= 0) html = html.slice(0, i) + "<mark>" + q + "</mark>" + html.slice(i + q.length);
  }
  return html;
}

function render() {
  const has = !!doc;
  $("importView").hidden = has;
  $("readerView").hidden = !has;
  $("exportBtn").disabled = !has || (!notes.length && !highlights.length);
  if (!has) return;
  $("docTitle").textContent = doc.title;
  const body = $("docBody");
  body.innerHTML = "";
  doc.paragraphs.forEach((text, i) => {
    const row = document.createElement("div");
    row.className = "prow";
    const p = document.createElement("p");
    p.dataset.idx = i;
    p.innerHTML = paragraphHtml(i, text);
    const margin = document.createElement("div");
    margin.className = "margin";
    for (const n of notes.filter((x) => x.pIndex === i)) margin.appendChild(noteEl(n));
    row.appendChild(p);
    row.appendChild(margin);
    body.appendChild(row);
  });
}

function noteEl(n) {
  const el = document.createElement("div");
  el.className = "note" + (n.loading ? " loading" : "");
  const quote = n.quote.length > 140 ? n.quote.slice(0, 140) + "…" : n.quote;
  el.innerHTML =
    '<div class="quote">' + esc(quote) + "</div>" +
    '<div class="q">' + esc(n.question) + "</div>" +
    '<div class="a">' + (n.error ? '<span style="color:#a33">' + esc(n.error) + "</span>" : esc(n.answer || "")) + "</div>" +
    (n.cite ? '<div class="cite">From paragraph ' + (n.pIndex + 1) + "</div>" : "");
  return el;
}

/* ---------- Selection ---------- */
function selectionInfo() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return null;
  const node = sel.anchorNode && sel.anchorNode.parentElement;
  const p = node && node.closest("p[data-idx]");
  if (!p) return null;
  const quote = sel.toString().trim();
  if (quote.length < 2) return null;
  return { pIndex: Number(p.dataset.idx), quote, rect: sel.getRangeAt(0).getBoundingClientRect() };
}

document.addEventListener("mouseup", (e) => {
  if ($("askBox").contains(e.target) || $("selBar").contains(e.target)) return;
  const info = selectionInfo();
  const bar = $("selBar");
  if (!info) { bar.hidden = true; return; }
  pendingSel = { pIndex: info.pIndex, quote: info.quote };
  bar.style.left = Math.min(info.rect.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - 300) + "px";
  bar.style.top = info.rect.bottom + window.scrollY + 8 + "px";
  bar.hidden = false;
});
document.addEventListener("mousedown", (e) => {
  if (!$("selBar").contains(e.target) && !$("askBox").contains(e.target)) {
    $("selBar").hidden = true;
    if ($("askBox").hidden === false && !e.target.closest(".askbox")) $("askBox").hidden = true;
  }
});

const QUICK = {
  explain: "Explain this passage in simpler words.",
  simplify: "Rewrite this so a smart 12-year-old would get it.",
  define: "Define the key term or phrase in this passage, as used here.",
  factcheck: "Is this accurate? Reason from the article text and say what would need checking.",
};

$("selBar").addEventListener("click", (e) => {
  const act = e.target.dataset && e.target.dataset.act;
  if (!act || !pendingSel) return;
  $("selBar").hidden = true;
  if (act === "highlight") {
    if (!highlights.some((h) => h.pIndex === pendingSel.pIndex && h.quote === pendingSel.quote))
      highlights.push({ ...pendingSel });
    persist();
    render();
    window.getSelection().removeAllRanges();
    return;
  }
  const q = act === "ask" ? null : QUICK[act];
  openAsk(pendingSel, q);
});

function openAsk(sel, presetQuestion) {
  const box = $("askBox");
  $("askQuote").textContent = sel.quote.length > 220 ? sel.quote.slice(0, 220) + "…" : sel.quote;
  box.style.left = Math.min(window.scrollX + 40, window.scrollX + document.documentElement.clientWidth - 340) + "px";
  box.style.top = window.scrollY + 120 + "px";
  box.hidden = false;
  $("askInput").value = "";
  if (presetQuestion) {
    ask(sel, presetQuestion);
  } else {
    $("askInput").focus();
    box.dataset.pending = JSON.stringify(sel);
  }
}
$("askBox").addEventListener("click", (e) => {
  if (e.target.classList.contains("chip")) {
    const sel = pendingSel;
    if (sel) ask(sel, e.target.dataset.q);
  }
});
$("askSend").onclick = () => {
  const q = $("askInput").value.trim();
  if (q && pendingSel) ask(pendingSel, q);
};
$("askInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("askSend").click();
});
$("askCancel").onclick = () => ($("askBox").hidden = true);

/* ---------- AI ---------- */
function contextAround(pIndex) {
  const from = Math.max(0, pIndex - 4);
  const to = Math.min(doc.paragraphs.length - 1, pIndex + 4);
  let out = [];
  for (let i = from; i <= to; i++) out.push("[" + (i + 1) + "] " + doc.paragraphs[i]);
  return out.join("\n\n").slice(0, 12000);
}

async function ask(sel, question) {
  $("askBox").hidden = true;
  window.getSelection().removeAllRanges();
  const note = { pIndex: sel.pIndex, quote: sel.quote, question, answer: "", loading: true, cite: true };
  notes.push(note);
  persist();
  render();

  if (!settings.apiKey) {
    note.loading = false;
    note.error = "No API key yet. Open Settings and paste your key.";
    persist(); render(); openSettings();
    return;
  }
  try {
    const res = await fetch(settings.baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + settings.apiKey,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are a careful reading assistant. The reader selected a passage from the article below and asked about it. " +
              "Answer in 2-5 sentences, plain language, grounded in the article text. If the article does not support an answer, say so. " +
              "Paragraphs are numbered; mention the paragraph number(s) you relied on.\n\nARTICLE (title: " + doc.title + ")\n\n" + contextAround(sel.pIndex),
          },
          {
            role: "user",
            content: 'Selected passage (paragraph ' + (sel.pIndex + 1) + '): "' + sel.quote + '"\n\nQuestion: ' + question,
          },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error("HTTP " + res.status + (t ? ": " + t.slice(0, 160) : ""));
    }
    const data = await res.json();
    note.answer = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || "").trim();
    if (!note.answer) throw new Error("empty answer from the model");
  } catch (e) {
    note.error =
      "Could not get an answer: " + e.message +
      ". If this says Failed to fetch, the endpoint likely blocked the browser request (CORS) - check the base URL in Settings or use an endpoint that allows browser calls.";
  }
  note.loading = false;
  persist();
  render();
}

/* ---------- Export ---------- */
$("exportBtn").onclick = () => {
  if (!doc) return;
  let md = "# " + doc.title + "\n\n_Notes from Marginalia_\n";
  if (highlights.length) {
    md += "\n## Highlights\n";
    for (const h of highlights) md += "\n- (p" + (h.pIndex + 1) + ") " + h.quote;
    md += "\n";
  }
  if (notes.length) {
    md += "\n## Questions & answers\n";
    for (const n of notes) {
      if (n.error) continue;
      md += "\n> " + n.quote + "\n\n**Q:** " + n.question + "\n\n**A:** " + n.answer + " (paragraph " + (n.pIndex + 1) + ")\n";
    }
  }
  const blob = new Blob([md], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (doc.title || "marginalia").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() + "-notes.md";
  a.click();
  URL.revokeObjectURL(a.href);
};

/* ---------- New ---------- */
$("newDocBtn").onclick = () => {
  if (doc && !confirm("Start a new document? Current notes and highlights are cleared.")) return;
  doc = null; notes = []; highlights = [];
  persist();
  render();
};

render();
