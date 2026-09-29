import Image from "next/image";

/**
 * The app icon, at the size a wordmark sits beside.
 *
 * It was a 48px circle with a `shadow-sky-500/40` glow, which made the brand on
 * a sign-in card look like a lit button. An icon in a page header is not a
 * button and should not cast light.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/icon1.png"
      alt="TickTock"
      width={44}
      height={44}
      className={className ?? "size-11 rounded-xl"}
    />
  );
}
