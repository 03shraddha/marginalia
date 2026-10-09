"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { validateKey } from "@/lib/ask";
import { BRAND } from "@/lib/brand";
import { Popover, barBtn } from "./Popover";

const STORAGE_KEY = "together:api-key";

/** Bring your own Together key. Stored in this browser only. */
export function KeyMenu() {
  const [key, setKey] = useState("");
  const [house, setHouse] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setKey(localStorage.getItem(STORAGE_KEY) ?? "");
    } catch {}
    fetch("/api/key")
      .then((r) => r.json())
      .then((j: { house?: boolean }) => setHouse(Boolean(j.house)))
      .catch(() => setHouse(false));
  }, []);

  const status = key ? "Your key" : house === false ? "Demo mode" : null;

  return (
    <Popover
      label="Together API key"
      width={320}
      triggerClass={barBtn}
      trigger={
        <>
          {key ? <span aria-hidden className="size-1.5 rounded-full bg-good" /> : <KeyRound size={15} aria-hidden />}
          {status && <span className="hidden sm:inline">{status}</span>}
        </>
      }
    >
      {(close) => <KeyPanel current={key} house={house} onSave={(v) => setKey(v)} close={close} />}
    </Popover>
  );
}

function KeyPanel({ current, house, onSave, close }: { current: string; house: boolean | null; onSave: (v: string) => void; close: () => void }) {
  const [draft, setDraft] = useState(current);
  const [state, setState] = useState<"idle" | "checking" | "bad">("idle");

  const save = async () => {
    const v = draft.trim();
    if (!v) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      onSave("");
      close();
      return;
    }
    setState("checking");
    const ok = await validateKey(v);
    if (!ok) {
      setState("bad");
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {}
    onSave(v);
    close();
  };

  return (
    <div>
      <p className="text-[13.5px] font-medium text-ink">Your Together API key</p>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-3">
        {house
          ? "Gloss runs on a shared key right now. Add yours to use your own quota."
          : "No key on this server, so answers are labelled demo output. Add a key for real ones."}
      </p>
      <input
        autoFocus
        type="password"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setState("idle");
        }}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="tgp_v1_..."
        autoComplete="off"
        spellCheck={false}
        aria-label="Together API key"
        className="mt-3 h-9 w-full rounded-lg border border-rule bg-bg px-3 text-[13px] tracking-wide text-ink outline-none focus-visible:outline-none placeholder:text-ink-4 focus:border-rule-strong"
      />
      {state === "bad" && <p className="mt-2 text-[12.5px] text-rubric-text">Together rejected that key. Check it and try again.</p>}
      <p className="mt-2 text-[11.5px] leading-snug text-ink-4">Sent with your requests only. Stored in this browser, never on a server, never logged.</p>
      <div className="mt-3 flex items-center justify-between">
        <a href={BRAND.keysUrl} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-rubric-text underline decoration-rule-strong underline-offset-4">
          Get a key on Together
        </a>
        <div className="flex gap-1.5">
          {current && (
            <button
              type="button"
              onClick={() => {
                setDraft("");
                try {
                  localStorage.removeItem(STORAGE_KEY);
                } catch {}
                onSave("");
              }}
              className="h-8 rounded-lg px-3 text-[12.5px] font-medium text-ink-2 hover:bg-sunk"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={state === "checking"}
            className="h-8 rounded-lg bg-ink px-3.5 text-[12.5px] font-medium text-bg disabled:opacity-60"
          >
            {state === "checking" ? "Checking" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
