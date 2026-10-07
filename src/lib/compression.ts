import imageCompression, { type Options } from "browser-image-compression";
import { UPLOAD_LIMITS, validateFile, getFileCategory, formatBytes } from "./uploadConfig";

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  savedPercent: number;
  wasCompressed: boolean;
  mimeType: string;
}

/**
 * Replaces or updates the filename extension when the re-encoded format changes (e.g. .png -> .webp).
 */
function updateFilenameExtension(filename: string, targetExtension: string): string {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) {
    return `${filename}.${targetExtension}`;
  }
  return `${filename.substring(0, dotIndex)}.${targetExtension}`;
}

/**
 * Compresses an image using browser-image-compression in a Web Worker,
 * resizing max dimension to 2560px and re-encoding to WebP at 0.85 quality.
 * If the resulting file is larger than the original, or if compression fails,
 * it returns the original file.
 *
 * For non-image files (PDFs, Office docs, videos), returns the original file as-is.
 */
export async function compressFileWithStats(file: File): Promise<CompressionResult> {
  const originalSize = file.size;

  // Validate file type and raw size first
  const { category } = validateFile(file);

  // If not an image (PDF, Word, PPT, MP4, etc.), no re-encoding is performed
  if (category !== "image") {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      savedBytes: 0,
      savedPercent: 0,
      wasCompressed: false,
      mimeType: file.type || "application/octet-stream",
    };
  }

  // Attempt WebP re-encoding first, with fallback to JPEG if needed
  try {
    const compressionOptions: Options = {
      maxSizeMB: UPLOAD_LIMITS.MAX_IMAGE_MB,
      maxWidthOrHeight: UPLOAD_LIMITS.IMAGE_MAX_DIMENSION,
      useWebWorker: true,
      fileType: "image/webp",
      initialQuality: UPLOAD_LIMITS.IMAGE_QUALITY,
      alwaysKeepResolution: false,
    };

    let compressedBlob: Blob;
    let targetMime = "image/webp";
    let targetExt = "webp";

    try {
      compressedBlob = await imageCompression(file, compressionOptions);
    } catch (webpErr) {
      console.warn("WebP compression failed, attempting JPEG fallback:", webpErr);
      targetMime = "image/jpeg";
      targetExt = "jpg";
      compressedBlob = await imageCompression(file, {
        ...compressionOptions,
        fileType: "image/jpeg",
      });
    }

    // Keep the original if the compressed result is larger
    if (compressedBlob.size >= originalSize) {
      return {
        file,
        originalSize,
        compressedSize: originalSize,
        savedBytes: 0,
        savedPercent: 0,
        wasCompressed: false,
        mimeType: file.type || "image/jpeg",
      };
    }

    const newFilename = updateFilenameExtension(file.name, targetExt);
    const compressedFile = new File([compressedBlob], newFilename, {
      type: targetMime,
      lastModified: Date.now(),
    });

    const savedBytes = Math.max(0, originalSize - compressedFile.size);
    const savedPercent = Math.round((savedBytes / originalSize) * 100);

    return {
      file: compressedFile,
      originalSize,
      compressedSize: compressedFile.size,
      savedBytes,
      savedPercent,
      wasCompressed: true,
      mimeType: targetMime,
    };
  } catch (err) {
    // Graceful error fallback: if compression fails, keep original file
    console.warn(
      `Image compression failed for ${file.name}; uploading original file within limit:`,
      err,
    );
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      savedBytes: 0,
      savedPercent: 0,
      wasCompressed: false,
      mimeType: file.type || "image/jpeg",
    };
  }
}

/**
 * Standard utility required by ONYX:
 * Compresses an image or passes through documents/videos.
 */
export async function compressFile(file: File): Promise<File> {
  const result = await compressFileWithStats(file);
  return result.file;
}

/**
 * Helper to display human readable savings message (e.g. "8.4 MB → 2.1 MB (Saved 75%)")
 */
export function formatCompressionSavings(stats: CompressionResult): string {
  if (!stats.wasCompressed || stats.savedBytes <= 0) {
    return `${formatBytes(stats.originalSize)}`;
  }
  return `${formatBytes(stats.originalSize)} → ${formatBytes(stats.compressedSize)} (Saved ${stats.savedPercent}%)`;
}
