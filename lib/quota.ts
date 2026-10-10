/**
 * The free allowance on the shared Together key. Readers get a few answers a
 * day without a key (more when signed in); after that they bring their own.
 * Readers with their own key are never counted.
 *
 * Counted per day in Postgres, so the limit holds across serverless
 * instances. Signed-out readers are counted by a hash of their address.
 * Without a database (local dev), it falls back to a per-instance counter.
 */

import { createHash } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { db } from "./db";
import { allow, clientId } from "./ratelimit";

/** Per day, on the shared key. */
export const FREE = {
  answer: { anon: 10, user: 30 },
  speak: { anon: 20, user: 60 },
} as const;
export type FreeKind = keyof typeof FREE;

export type FreeState = { ok: boolean; left: number; limit: number; signedIn: boolean };

async function who(req: Request, kind: FreeKind) {
  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {}
  if (userId) return { subject: `${kind}:user:${userId}`, limit: FREE[kind].user, signedIn: true };
  const ip = createHash("sha256").update(`gloss:${clientId(req)}`).digest("hex").slice(0, 32);
  return { subject: `${kind}:ip:${ip}`, limit: FREE[kind].anon, signedIn: false };
}

/** Use one free request. `ok` is false once today's allowance is spent. */
export async function takeFree(req: Request, kind: FreeKind = "answer"): Promise<FreeState> {
  const w = await who(req, kind);
  if (process.env.DATABASE_URL) {
    try {
      // Counts only while under the limit, in one statement, so parallel requests cannot overshoot.
      const rows = await db().query(
        `insert into free_usage (subject, day, count) values ($1, current_date, 1)
         on conflict (subject, day) do update set count = free_usage.count + 1 where free_usage.count < $2
         returning count`,
        [w.subject, w.limit]
      );
      const used = rows.length ? Number(rows[0].count) : w.limit;
      return { ok: rows.length > 0, left: Math.max(0, w.limit - used), limit: w.limit, signedIn: w.signedIn };
    } catch {
      // The database is unreachable: fall through to the per-instance counter rather than block everyone.
    }
  }
  const ok = allow(w.subject, w.limit, 86_400_000);
  return { ok, left: ok ? 1 : 0, limit: w.limit, signedIn: w.signedIn };
}

/** Today's allowance without using any of it, for the key menu. */
export async function peekFree(req: Request, kind: FreeKind = "answer"): Promise<Omit<FreeState, "ok">> {
  const w = await who(req, kind);
  let used = 0;
  if (process.env.DATABASE_URL) {
    try {
      const rows = await db().query("select count from free_usage where subject = $1 and day = current_date", [w.subject]);
      used = rows.length ? Number(rows[0].count) : 0;
    } catch {}
  }
  return { left: Math.max(0, w.limit - used), limit: w.limit, signedIn: w.signedIn };
}

/** The JSON a route answers with when a reader needs their own key. */
export function needKey(state: FreeState | null, what = "answers"): Response {
  const error = !state
    ? "Add your Together API key to start. It stays in this browser."
    : `You've used today's ${state.limit} free ${what}. Add your Together API key to keep going${state.signedIn ? "" : `, or sign in for ${FREE.answer.user} a day`}.`;
  return Response.json({ error, code: "need_key" }, { status: state ? 429 : 401, headers: { "X-Free-Left": "0" } });
}
