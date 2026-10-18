/**
 * Read aloud: Sarvam Bulbul over HTTP streaming. The stream endpoint sends raw
 * MP3 bytes as soon as the first audio is ready (about 0.3 s to the first byte,
 * checked 2026-10-18), so playback can begin before the clip is finished.
 * The live model string is "bulbul:v4-flash"; plain "bulbul:v4" is refused,
 * and the short v3 speaker names ("shubh", "simran") are refused by v4 Flash.
 */
export const TTS_URL = "https://api.sarvam.ai/text-to-speech/stream";
export const TTS_MODEL = "bulbul:v4-flash";
/** One request's worth of text. Paragraphs past this are split at sentence ends. The endpoint takes up to 3500. */
export const TTS_MAX_CHARS = 1200;

/**
 * Natural English (en-IN) v4 Flash personas made for narration and long
 * reading, mixed male and female. Each one also takes any language code below
 * (checked with real calls).
 */
export const VOICES = [
  { id: "shubh_en_audiobook", name: "Shubh", gender: "male" },
  { id: "simran_en_narration", name: "Simran", gender: "female" },
  { id: "sarang_en_narration", name: "Sarang", gender: "male" },
  { id: "aditi_en_stories", name: "Aditi", gender: "female" },
  { id: "girish_en_documentary", name: "Girish", gender: "male" },
  { id: "ishita_en_stories", name: "Ishita", gender: "female" },
] as const;
export type VoiceId = (typeof VOICES)[number]["id"];
export const DEFAULT_VOICE: VoiceId = "shubh_en_audiobook";

/** Sets how numbers, dates and names are read. The text is passed as it is: nothing is translated. */
export const VOICE_LANGS = [
  { code: "en-IN", name: "English" },
  { code: "hi-IN", name: "Hindi" },
  { code: "ta-IN", name: "Tamil" },
  { code: "te-IN", name: "Telugu" },
  { code: "kn-IN", name: "Kannada" },
  { code: "ml-IN", name: "Malayalam" },
  { code: "bn-IN", name: "Bengali" },
  { code: "mr-IN", name: "Marathi" },
  { code: "gu-IN", name: "Gujarati" },
] as const;
export type VoiceLang = (typeof VOICE_LANGS)[number]["code"];
export const DEFAULT_LANG: VoiceLang = "en-IN";

export const isVoice = (v: unknown): v is VoiceId => VOICES.some((x) => x.id === v);
export const isVoiceLang = (v: unknown): v is VoiceLang => VOICE_LANGS.some((x) => x.code === v);
