import Link from "next/link";
import { BRAND } from "@/lib/brand";

/** Lines of text with a note in the margin: the whole idea in 24px. */
export function GlossMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M3 6.5h10.5M3 11.5h10.5M3 16.5h6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18.5 3v18" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.32" />
      <circle cx="18.5" cy="11.5" r="2.9" fill="var(--accent)" />
    </svg>
  );
}

/** The wordmark: the mark, then the name in the system display face. */
export function GlossWordmark() {
  return (
    <span className="flex h-9 items-center gap-[7px] text-ink">
      <GlossMark className="size-[21px] shrink-0" />
      <span className="block font-display text-[19px] font-semibold leading-none tracking-[-0.022em]">{BRAND.name}</span>
    </span>
  );
}

/** The app's mark, a hairline, then Sarvam as the maker. */
export function Lockup({ href = "/" }: { href?: string }) {
  return (
    <div className="flex h-9 items-center gap-3 max-[380px]:gap-2">
      <Link href={href} aria-label={BRAND.name} className="rounded-md">
        <GlossWordmark />
      </Link>
    </div>
  );
}
