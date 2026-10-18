import { requestKey, sarvamKey } from "@/lib/llm";
import { allow, clientId } from "@/lib/ratelimit";
import { DEFAULT_LANG, DEFAULT_VOICE, isVoice, isVoiceLang, TTS_MAX_CHARS, TTS_MODEL, TTS_URL } from "@/lib/voice";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One passage, spoken by Sarvam Bulbul on the app's own key. The MP3 streams
 * straight through, so playback can begin before the whole clip exists.
 */
export async function POST(req: Request) {
  let body: { text?: string; voice?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ error: "Nothing to read." }, { status: 400 });
  if (text.length > TTS_MAX_CHARS + 200) return Response.json({ error: "That passage is too long to read in one go." }, { status: 413 });
  const speaker = isVoice(body.voice) ? body.voice : DEFAULT_VOICE;
  const language_code = isVoiceLang(body.lang) ? body.lang : DEFAULT_LANG;

  // The reader's own key first, then the server's.
  const apiKey = sarvamKey(requestKey(req));
  if (!apiKey) return Response.json({ error: "Add your API key to use this. It stays in this browser.", code: "need_key" }, { status: 401 });

  // A clip is a paragraph or so, fetched two ahead of the voice: generous for one reader, a ceiling for a script.
  const who = clientId(req);
  if (!allow(`speak:${who}`, 40, 60_000) || !allow(`speak-day:${who}`, 1500, 86_400_000)) {
    return Response.json({ error: "Too much reading aloud for now. Wait a minute, then try again." }, { status: 429 });
  }

  let res: Response;
  try {
    res = await fetch(TTS_URL, {
      method: "POST",
      signal: req.signal,
      headers: { "Content-Type": "application/json", "api-subscription-key": apiKey },
      body: JSON.stringify({ model: TTS_MODEL, speaker, language_code, text, output_audio_codec: "mp3", enable_preprocessing: true }),
    });
  } catch {
    return Response.json({ error: "Could not reach the voice. Check your connection." }, { status: 502 });
  }
  if (!res.ok || !res.body) {
    let msg = `The voice answered ${res.status}.`;
    try {
      const j = (await res.json()) as { error?: { message?: string } | string };
      msg = typeof j.error === "string" ? j.error : j.error?.message ?? msg;
    } catch {}
    if (res.status === 401 || res.status === 403) return Response.json({ error: "That API key was rejected. Check it and try again.", code: "need_key" }, { status: 401 });
    return Response.json({ error: msg }, { status: res.status === 429 ? 429 : 502 });
  }
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
