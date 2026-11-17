import Image from "next/image";
import type { AcademyThemeMode } from "@/lib/academy-theme";
import { APP_NAME } from "@/lib/constants";

type AcademyLogoMarkProps = {
  name: string;
  logoUrl: string | null;
  themeMode: AcademyThemeMode;
};

/**
 * Renders the Academy's uploaded logo mark or falls back to the platform wordmark
 * matched to the public light or dark theme mode.
 */
export function AcademyLogoMark({
  name,
  logoUrl,
  themeMode,
}: AcademyLogoMarkProps) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={`${name} logo`}
        width={160}
        height={40}
        sizes="10rem"
        className="max-h-10 w-auto object-contain"
      />
    );
  }

  return (
    <Image
      src={themeMode === "light" ? "/logo-black.svg" : "/logo-white.svg"}
      alt={APP_NAME}
      width={893}
      height={143}
      className="h-6 w-auto"
    />
  );
}
