"use client";

import { useSyncExternalStore } from "react";

/** The library's own preferences, kept apart from the reading settings. */
export type LibraryPrefs = { paintedCovers: boolean };

const KEY = "gloss:library";
const DEFAULTS: LibraryPrefs = { paintedCovers: false };
const listeners = new Set<() => void>();
let cache: LibraryPrefs | null = null;

function read(): LibraryPrefs {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    cache = DEFAULTS;
  }
  return cache!;
}

export function setLibraryPrefs(p: Partial<LibraryPrefs>) {
  cache = { ...read(), ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {}
  listeners.forEach((l) => l());
}

export function useLibraryPrefs(): LibraryPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => DEFAULTS
  );
}
