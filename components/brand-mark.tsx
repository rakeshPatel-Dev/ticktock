import Image from "next/image";

export function BrandMark() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full overflow-hidden shadow-md shadow-sky-500/40">
      <Image src="/icon1.png" alt="TickTock" width={48} height={48} />
    </div>
  );
}