import { requestKey, sarvamKey } from "@/lib/llm";
import { allow, clientId } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const STT_URL = "https://api.sarvam.ai/speech-to-text";
const STT_MODEL = "saaras:v3";
/** The sync REST endpoint takes at most 30 s of audio. 30 s of AAC at 256 kbps is about 1 MB; leave room. */
const MAX_BYTES = 4 * 1024 * 1024;

const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/mp4": "m4a",
  "video/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/aiff": "aiff",
  "audio/x-aiff": "aiff",
  "audio/flac": "flac",
};

/**
 * A spoken question, as text. Takes the recording as multipart (field "file")
 * or as the raw request body, and asks Sarvam's Saaras model to transcribe it
 * in whatever language was spoken.
 */
export async function POST(req: Request) {
  if (!allow(`stt:${clientId(req)}`, 20, 60_000)) {
    return Response.json({ error: "Too many voice questions at once. Wait a moment and try again." }, { status: 429 });
  }
  // The reader's own key first, then the server's.
  const apiKey = sarvamKey(requestKey(req));
  if (!apiKey) return Response.json({ error: "Add your API key to use this. It stays in this browser.", code: "need_key" }, { status: 401 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES + 64 * 1024) return Response.json({ error: "That recording is too long. Keep it under 30 seconds." }, { status: 413 });

  let audio: Blob;
  try {
    const ctype = req.headers.get("content-type") ?? "";
    if (ctype.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof Blob)) return Response.json({ error: "No audio in the request." }, { status: 400 });
      audio = file;
    } else {
      const buf = await req.arrayBuffer();
      audio = new Blob([buf], { type: ctype || "application/octet-stream" });
    }
  } catch {
    return Response.json({ error: "Could not read the recording." }, { status: 400 });
  }
  if (audio.size === 0) return Response.json({ error: "The recording was empty." }, { status: 400 });
  if (audio.size > MAX_BYTES) return Response.json({ error: "That recording is too long. Keep it under 30 seconds." }, { status: 413 });

  // "audio/webm;codecs=opus" -> "audio/webm"; Sarvam detects the codec, but a sensible name and type help.
  const mime = (audio.type || "").split(";")[0].trim().toLowerCase();
  const ext = EXT[mime] ?? "webm";
  const form = new FormData();
  form.append("file", new Blob([await audio.arrayBuffer()], { type: mime || "audio/webm" }), `question.${ext}`);
  form.append("model", STT_MODEL);
  form.append("mode", "transcribe");
  form.append("language_code", "unknown");

  let res: Response;
  try {
    res = await fetch(STT_URL, { method: "POST", signal: req.signal, headers: { "api-subscription-key": apiKey }, body: form });
  } catch {
    return Response.json({ error: "Could not reach the speech service. Check your connection." }, { status: 502 });
  }
  if (!res.ok) {
    let msg = `The speech service answered ${res.status}.`;
    try {
      const j = (await res.json()) as { error?: { message?: string } | string };
      msg = typeof j.error === "string" ? j.error : j.error?.message ?? msg;
    } catch {}
    if (res.status === 401 || res.status === 403) return Response.json({ error: "That API key was rejected. Check it and try again.", code: "need_key" }, { status: 401 });
    if (res.status === 422 || res.status === 400) msg = "Could not understand that recording. Try again, a little closer to the mic.";
    return Response.json({ error: msg }, { status: res.status === 429 ? 429 : 502 });
  }
  const j = (await res.json()) as { transcript?: string; language_code?: string | null };
  return Response.json({ text: (j.transcript ?? "").trim(), language: j.language_code ?? null }, { headers: { "Cache-Control": "no-store" } });
}
