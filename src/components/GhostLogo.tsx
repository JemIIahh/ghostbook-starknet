"use client";

import Image from "next/image";
import { logoHeight } from "@/components/ghostArt";

type GhostLogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
};

/** Brand ghost mark — transparent PNG. */
export default function GhostLogo({
  size = 32,
  className = "",
  priority = false,
  alt = "GhostBook",
}: GhostLogoProps) {
  return (
    <Image
      src="/logo.png"
      alt={alt}
      width={size}
      height={logoHeight(size)}
      priority={priority}
      className={`object-contain ${className}`}
    />
  );
}
