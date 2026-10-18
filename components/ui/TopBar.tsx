"use client";

import Link from "next/link";
import { BookOpenText, Library } from "lucide-react";
import { Account } from "@/components/account/Account";
import { Lockup } from "@/components/brand/Gloss";
import { KeyMenu } from "@/components/ui/KeyMenu";
import { SettingsMenu } from "@/components/ui/SettingsMenu";

/**
 * The bar across the top of the home page and the library: the same pieces in
 * the same places on both, so moving between them never shifts anything.
 * On phones a tab bar at the foot of the screen carries the way between them.
 */
export function TopBar({ here, onLibrary }: { here?: "library"; onLibrary?: () => void }) {
  const toLibrary = (e: React.MouseEvent) => {
    if (!onLibrary) return;
    e.preventDefault();
    onLibrary();
  };
  return (
    <>
      <header className="relative z-20 mx-auto flex h-[var(--topbar-h)] w-full max-w-[1400px] shrink-0 items-center justify-between px-5 max-[380px]:px-4 sm:px-8">
        <Lockup />
        <nav aria-label="Main" className="flex items-center gap-0.5">
          <Link
            href="/library"
            aria-current={here === "library" ? "page" : undefined}
            onClick={toLibrary}
            className="bar-btn mr-1 inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-fill hover:text-ink aria-[current=page]:bg-fill aria-[current=page]:text-ink max-sm:hidden"
          >
            <Library size={16} />
            <span>Library</span>
          </Link>
          <SettingsMenu compact />
          <KeyMenu />
          <Account />
        </nav>
      </header>

      <nav aria-label="Sections" className="tabbar">
        <Link href="/" aria-current={here === "library" ? undefined : "page"} className="tabbar-item">
          <BookOpenText size={23} strokeWidth={1.8} aria-hidden />
          Read
        </Link>
        <Link href="/library" aria-current={here === "library" ? "page" : undefined} onClick={toLibrary} className="tabbar-item">
          <Library size={23} strokeWidth={1.8} aria-hidden />
          Library
        </Link>
      </nav>
    </>
  );
}
