"use client";

import type { ReactNode } from "react";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { Headphones, Keyboard, MoreHorizontal, NotebookPen, ScrollText, SlidersHorizontal, User } from "lucide-react";
import { fetchBrief } from "@/lib/ask";
import { useGlosses, useHighlights, useStore } from "@/lib/store";
import { Popover, barBtn } from "@/components/ui/Popover";
import { toggleListen, useListening } from "./Listen";
import { useReader } from "./context";

const row = "flex h-9 w-full items-center gap-3 rounded-[8px] px-2.5 text-left text-[14px] text-ink-2 transition-colors hover:bg-fill hover:text-ink";

function Item({ icon, children, onClick, hint }: { icon: ReactNode; children: ReactNode; onClick: () => void; hint?: ReactNode }) {
  return (
    <button type="button" className={row} onClick={onClick}>
      <span className="grid size-4 place-items-center text-ink-3" aria-hidden>
        {icon}
      </span>
      <span className="flex-1">{children}</span>
      {hint && <span className="text-[12px] text-ink-4">{hint}</span>}
    </button>
  );
}

/**
 * Everything that is not "select, ask, read the margin" lives here, in one
 * quiet menu: read aloud, the brief, the notebook, display, shortcuts, account.
 */
export function MoreMenu({ listenFrom }: { listenFrom: () => string | null }) {
  const { ix } = useReader();
  const setUI = useStore((s) => s.setUI);
  const brief = useStore((s) => s.briefs[ix.article.id]);
  const briefOpen = useStore((s) => s.briefOpen);
  const notebookOpen = useStore((s) => s.notebookOpen);
  const count = useGlosses(ix.article.id).length + useHighlights(ix.article.id).length;
  const listening = useListening();

  return (
    <Popover label="More" tip="More" width={236} triggerClass={`${barBtn} !px-2`} trigger={<MoreHorizontal size={18} strokeWidth={1.8} />}>
      {(close) => {
        const run = (fn: () => void) => () => {
          close();
          fn();
        };
        return (
          <div className="-m-2">
            <Item icon={<Headphones size={15} />} onClick={run(() => toggleListen(ix, listenFrom))}>
              {listening ? "Stop reading aloud" : "Read aloud"}
            </Item>
            <Item
              icon={<ScrollText size={15} />}
              hint="B"
              onClick={run(() => {
                if (!brief || brief.status === "error") fetchBrief(ix);
                else setUI({ briefOpen: !briefOpen });
                window.scrollTo({ top: 0, behavior: "smooth" });
              })}
            >
              {brief?.status === "ready" ? (briefOpen ? "Hide the brief" : "Show the brief") : "Brief of this text"}
            </Item>
            <Item icon={<NotebookPen size={15} />} hint={count > 0 ? count : "N"} onClick={run(() => setUI({ notebookOpen: !notebookOpen }))}>
              Notebook
            </Item>
            <Item icon={<SlidersHorizontal size={15} />} onClick={run(() => window.dispatchEvent(new Event("gloss:settings")))}>
              Text and display
            </Item>
            <Item icon={<Keyboard size={15} />} hint="?" onClick={run(() => setUI({ shortcutsOpen: true }))}>
              Shortcuts
            </Item>
            <div className="mx-2.5 my-1.5 h-px bg-rule" aria-hidden />
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button type="button" className={row}>
                  <span className="grid size-4 place-items-center text-ink-3" aria-hidden>
                    <User size={15} />
                  </span>
                  Sign in to sync
                </button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <div className={`${row} hover:bg-transparent`}>
                <UserButton appearance={{ elements: { avatarBox: "size-6" } }} />
                <span>Account</span>
              </div>
            </Show>
          </div>
        );
      }}
    </Popover>
  );
}
