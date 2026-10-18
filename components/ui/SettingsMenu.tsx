"use client";

import { useState, type ReactNode } from "react";
import { AlignJustify, AlignLeft, Focus, Headphones, Map as MapIcon, Minus, Paintbrush, Pilcrow, Plus, RotateCcw } from "lucide-react";
import { MODELS, type ModelKey } from "@/lib/models";
import { applySettings, DEFAULT_SETTINGS, FACES, MARKERS, type Settings } from "@/lib/settings";
import { useStore } from "@/lib/store";
import { Popover, barBtn } from "./Popover";
import { setLibraryPrefs, useLibraryPrefs } from "@/lib/library-prefs";

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { key: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="seg" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)} className="seg-btn">
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3">
      <span className="text-[13px] text-ink-2">{label}</span>
      {children}
    </div>
  );
}

/** One row of an inset grouped list: a tinted icon, a label, and an iOS switch. */
function Toggle({ on, onChange, label, icon, tint, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; icon: ReactNode; tint: string; hint?: string }) {
  return (
    <label className="group-row cursor-pointer">
      <span className="group-icon" style={{ background: tint }} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block leading-tight">{label}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="ios-switch is-small" />
    </label>
  );
}

/** The library's one setting: a painted cover for every text. Off by default, since each one is an image model call. */
function PaintedCovers() {
  const { paintedCovers } = useLibraryPrefs();
  return (
    <div className="group-list">
      <Toggle
        label="Painted covers"
        hint="A picture for each text in your library, about 2¢ each."
        icon={<Paintbrush size={14} />}
        tint="#af52de"
        on={paintedCovers}
        onChange={(v) => setLibraryPrefs({ paintedCovers: v })}
      />
    </div>
  );
}

/**
 * Type, colour and answers in one small panel. Every change applies to the
 * page underneath immediately, so the page itself is the preview.
 */
export function SettingsMenu({ compact = false, bare = false }: { compact?: boolean; bare?: boolean }) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const focusMode = useStore((s) => s.focusMode);
  const setUI = useStore((s) => s.setUI);
  const [tab, setTab] = useState<"look" | "text" | "answers">("look");

  const set = (patch: Partial<Settings>) => {
    setSettings(patch);
    applySettings({ ...useStore.getState().settings });
  };
  const size = (v: number) => set({ size: Math.max(15, Math.min(28, v)) });

  return (
    <Popover label="Appearance and answers" tip="Appearance" width={compact ? 316 : 348} triggerClass={barBtn} bare={bare} openOn="gloss:settings" trigger={<span className="block text-[15px] font-semibold leading-none tracking-[-0.02em]">Aa</span>}>
      {() => (
        <div>
          {!compact && (
            <div className="mb-4">
              <Seg
                label="Settings section"
                value={tab}
                onChange={setTab}
                options={[
                  { key: "look", label: "Look" },
                  { key: "text", label: "Text" },
                  { key: "answers", label: "Answers" },
                ]}
              />
            </div>
          )}

          {(compact || tab === "look") && (
            <div className="space-y-3.5">
              {!compact && (
                <>
                  <Row label="Highlighter">
                    <div className="flex items-center gap-2">
                      {MARKERS.map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => set({ marker: m.key })}
                          aria-pressed={settings.marker === m.key}
                          aria-label={`${m.label} highlighter`}
                          data-tip={m.label}
                          className={`grid size-7 place-items-center rounded-full transition-[box-shadow,transform] active:scale-90 ${settings.marker === m.key ? "shadow-[0_0_0_2px_var(--bg-raised),0_0_0_4px_var(--accent)]" : ""}`}
                        >
                          <span className="h-3 w-5 -rotate-12 rounded-[3px] opacity-80" style={{ background: m.color }} />
                        </button>
                      ))}
                      <span className="ml-1 text-[12px] text-ink-3">{MARKERS.find((m) => m.key === settings.marker)?.label}</span>
                    </div>
                  </Row>
                  <div className="group-list">
                    <Toggle label="Paragraph numbers" icon={<Pilcrow size={14} />} tint="#8e8e93" on={settings.numbers} onChange={(v) => set({ numbers: v })} />
                    <Toggle label="Map of the text" icon={<MapIcon size={14} />} tint="#34c759" on={settings.rail} onChange={(v) => set({ rail: v })} />
                    <Toggle label="Focus mode" icon={<Focus size={14} />} tint="#5856d6" on={focusMode} onChange={(v) => setUI({ focusMode: v })} />
                    <Toggle label="Listen" icon={<Headphones size={14} />} tint="#ff2d55" on={settings.listen} onChange={(v) => set({ listen: v })} />
                  </div>
                </>
              )}
              <PaintedCovers />
            </div>
          )}

          {!compact && tab === "text" && (
            <div className="space-y-3.5">
              <div>
                <p className="mb-2.5 text-[13px] font-semibold text-ink">Typeface</p>
                <div className="grid grid-cols-4 gap-2">
                  {FACES.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => set({ face: f.key })}
                      aria-pressed={settings.face === f.key}
                      className={`group flex h-[62px] flex-col items-center justify-center gap-1 rounded-[12px] bg-raised transition-[box-shadow,transform] active:scale-[0.97] ${
                        settings.face === f.key ? "shadow-[0_0_0_2px_var(--accent)]" : "shadow-[0_0_0_0.5px_var(--hairline)] hover:shadow-[0_0_0_0.5px_var(--rule-strong)]"
                      }`}
                    >
                      <span className="text-[22px] leading-none text-ink" style={{ fontFamily: f.css }}>
                        Ag
                      </span>
                      <span className={`text-[11px] leading-none ${settings.face === f.key ? "font-semibold text-accent" : "text-ink-3"}`}>{f.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Row label="Size">
                <div className="flex items-center gap-1.5">
                  <button type="button" aria-label="Smaller text" data-tip="Smaller" onClick={() => size(settings.size - 1)} className="btn-gray size-7 !rounded-full text-ink-2">
                    <Minus size={14} />
                  </button>
                  <input
                    type="range"
                    min={15}
                    max={28}
                    value={settings.size}
                    onChange={(e) => size(Number(e.target.value))}
                    aria-label="Text size"
                    className="h-1 min-w-0 flex-1 accent-[var(--accent)]"
                  />
                  <button type="button" aria-label="Larger text" data-tip="Larger" onClick={() => size(settings.size + 1)} className="btn-gray size-7 !rounded-full text-ink-2">
                    <Plus size={14} />
                  </button>
                  <span className="w-6 text-right text-[12px] tabular-nums text-ink-3">{settings.size}</span>
                </div>
              </Row>
              <Row label="Spacing">
                <Seg
                  label="Line spacing"
                  value={settings.leading}
                  onChange={(v) => set({ leading: v })}
                  options={[
                    { key: "tight", label: "Snug" },
                    { key: "normal", label: "Even" },
                    { key: "loose", label: "Airy" },
                  ]}
                />
              </Row>
              <Row label="Width">
                <Seg
                  label="Column width"
                  value={settings.width}
                  onChange={(v) => set({ width: v })}
                  options={[
                    { key: "narrow", label: "Narrow" },
                    { key: "normal", label: "Even" },
                    { key: "wide", label: "Wide" },
                  ]}
                />
              </Row>
              <Row label="Align">
                <Seg
                  label="Text alignment"
                  value={settings.align}
                  onChange={(v) => set({ align: v })}
                  options={[
                    { key: "left", label: <><AlignLeft size={13} /> Left</> },
                    { key: "justify", label: <><AlignJustify size={13} /> Justified</> },
                  ]}
                />
              </Row>
              <Row label="Paragraphs">
                <Seg
                  label="Paragraph style"
                  value={settings.paras}
                  onChange={(v) => set({ paras: v })}
                  options={[
                    { key: "spaced", label: "Spaced" },
                    { key: "indented", label: "Indented" },
                  ]}
                />
              </Row>
              {(["face", "size", "leading", "width", "align", "paras"] as const).some((k) => settings[k] !== DEFAULT_SETTINGS[k]) && (
                <button
                  type="button"
                  onClick={() =>
                    set({
                      face: DEFAULT_SETTINGS.face,
                      size: DEFAULT_SETTINGS.size,
                      leading: DEFAULT_SETTINGS.leading,
                      width: DEFAULT_SETTINGS.width,
                      align: DEFAULT_SETTINGS.align,
                      paras: DEFAULT_SETTINGS.paras,
                    })
                  }
                  className="link-accent inline-flex items-center gap-1.5 text-[13px]"
                >
                  <RotateCcw size={12} /> Reset text settings
                </button>
              )}
            </div>
          )}

          {!compact && tab === "answers" && (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[13px] font-semibold text-ink">Answer length</p>
                <Seg
                  label="Answer length"
                  value={settings.length}
                  onChange={(v) => set({ length: v })}
                  options={[
                    { key: "short", label: "Short" },
                    { key: "normal", label: "Balanced" },
                    { key: "long", label: "Detailed" },
                  ]}
                />
                <p className="mt-2 text-[12px] leading-snug text-ink-4">
                  {settings.length === "short" ? "A sentence or three." : settings.length === "long" ? "Room for nuance, up to a short paragraph or two." : "About a paragraph."}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}
