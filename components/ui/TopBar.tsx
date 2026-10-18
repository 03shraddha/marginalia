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
          <SettingsMenu compact />
          <KeyMenu />
          <Account />
        </nav>
      </header>
    </>
  );
}
