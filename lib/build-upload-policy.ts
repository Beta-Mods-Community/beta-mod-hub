import { formatBytes } from "./pilot";

export const BUILD_ARCHIVE_ACCEPT = ".zip,.7z,.rar,.tar,.tar.gz,.tgz";
export function validateBuildArchive(name: string, size: number, maxBytes: number): string | null {
  if (!size) return "Choose a non-empty archive.";
  if (size > maxBytes) return `This archive is ${formatBytes(size)}; the limit is ${formatBytes(maxBytes)}.`;
  if (!/\.(zip|7z|rar|tar|tar\.gz|tgz)$/i.test(name)) return "Package the mod as a ZIP, 7z, RAR, TAR, or TAR.GZ archive before uploading.";
  return null;
}
