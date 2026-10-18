import { BRAND } from "@/lib/brand";

/**
 * Sarvam, linked and recessed: a plain wordmark in the system face. Use it
 * beside the app mark, or on its own in a footer column.
 */
export function SarvamLink({ className = "" }: { className?: string }) {
  return (
    <a
      href={BRAND.sarvamUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Sarvam"
      data-tip="Models served by Sarvam"
      className={`flex h-9 shrink-0 items-center rounded-md px-0.5 text-[15px] font-semibold leading-none tracking-[-0.01em] text-ink opacity-70 transition-opacity duration-200 hover:opacity-100 ${className}`}
    >
      Sarvam
    </a>
  );
}
