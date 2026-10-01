import Image from "next/image";

/** The same vector mark is used in navigation, the footer, and repository branding. */
export default function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <Image
      src="/images/beta-mods-mark.svg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="shrink-0"
    />
  );
}
