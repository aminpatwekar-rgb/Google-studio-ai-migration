/**
 * Centralized upload configuration and validation limits for ONYX.
 * All file size and dimension constraints are defined here.
 */

export const MAX_IMAGE_MB = 25;
export const MAX_DOCUMENT_MB = 100;
export const MAX_VIDEO_MB = 500;
export const IMAGE_MAX_DIMENSION = 2560;
export const IMAGE_QUALITY = 0.85;

export const UPLOAD_LIMITS = {
  MAX_IMAGE_MB,
  MAX_DOCUMENT_MB,
  MAX_VIDEO_MB,
  IMAGE_MAX_DIMENSION,
  IMAGE_QUALITY,
} as const;

export const MAX_IMAGE_BYTES = UPLOAD_LIMITS.MAX_IMAGE_MB * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = UPLOAD_LIMITS.MAX_DOCUMENT_MB * 1024 * 1024;
export const MAX_VIDEO_BYTES = UPLOAD_LIMITS.MAX_VIDEO_MB * 1024 * 1024;

export const ALLOWED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "txt",
  "mp4",
] as const;

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "video/mp4",
] as const;

export type FileCategory = "image" | "document" | "video" | "unsupported";

/**
 * Extracts normalized file extension from a filename or path.
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase().trim() : "";
}

/**
 * Categorizes a file by MIME type and filename extension.
 */
export function getFileCategory(file: File): FileCategory {
  const mime = file.type.toLowerCase();
  const ext = getFileExtension(file.name);

  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(ext)) {
    return "image";
  }

  if (mime === "video/mp4" || ext === "mp4") {
    return "video";
  }

  if (
    mime === "application/pdf" ||
    mime === "application/msword" ||
    mime.includes("officedocument") ||
    mime.includes("powerpoint") ||
    mime === "text/plain" ||
    ["pdf", "doc", "docx", "ppt", "pptx", "txt"].includes(ext)
  ) {
    return "document";
  }

  return "unsupported";
}

/**
 * Returns the maximum allowed byte size for a given file category.
 */
export function getMaxBytesForCategory(category: FileCategory): number {
  switch (category) {
    case "image":
      return MAX_IMAGE_BYTES;
    case "video":
      return MAX_VIDEO_BYTES;
    case "document":
      return MAX_DOCUMENT_BYTES;
    default:
      return MAX_DOCUMENT_BYTES;
  }
}

/**
 * Formats byte count to a readable human format (e.g. "8.4 MB", "520 KB").
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Validates file type and size against ONYX upload constraints.
 * Throws a human-friendly error if validation fails.
 */
export function validateFile(file: File): { category: FileCategory; extension: string } {
  if (!file) {
    throw new Error("No file selected.");
  }

  const ext = getFileExtension(file.name);
  const category = getFileCategory(file);

  if (category === "unsupported" || !ALLOWED_EXTENSIONS.includes(ext as AllowedExtension)) {
    throw new Error(
      `File type ".${ext || "unknown"}" is not supported. Allowed formats: ${ALLOWED_EXTENSIONS.join(", ")}.`,
    );
  }

  const maxBytes = getMaxBytesForCategory(category);
  if (file.size > maxBytes) {
    const maxMB =
      category === "image"
        ? UPLOAD_LIMITS.MAX_IMAGE_MB
        : category === "video"
          ? UPLOAD_LIMITS.MAX_VIDEO_MB
          : UPLOAD_LIMITS.MAX_DOCUMENT_MB;

    throw new Error(
      `"${file.name}" (${formatBytes(file.size)}) exceeds the maximum allowed ${category} size of ${maxMB} MB.`,
    );
  }

  return { category, extension: ext };
}
