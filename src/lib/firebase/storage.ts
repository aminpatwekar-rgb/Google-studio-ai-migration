import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "./config";
import { compressFileWithStats, formatCompressionSavings } from "@/lib/compression";
import { validateFile, UPLOAD_LIMITS, formatBytes } from "@/lib/uploadConfig";

export type UploadProgressCallback = (info: {
  state: "validating" | "compressing" | "uploading" | "completed" | "error";
  progressPercent: number;
  fileName: string;
  originalSize: number;
  compressedSize: number;
  savingsLabel?: string;
  message: string;
}) => void;

export interface ManagedUploadResult {
  path: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  originalSizeBytes: number;
  wasCompressed: boolean;
  savingsLabel?: string;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

/**
 * Core upload engine that validates files, compresses images via web workers,
 * tracks upload progress using uploadBytesResumable, and enforces storage quotas.
 */
async function uploadManagedFile(
  basePath: string,
  rawFile: File,
  uid: string,
  customMetadata: Record<string, string>,
  onProgress?: UploadProgressCallback,
): Promise<ManagedUploadResult> {
  // 1. Validation against centralized limits & allowed formats
  onProgress?.({
    state: "validating",
    progressPercent: 0,
    fileName: rawFile.name,
    originalSize: rawFile.size,
    compressedSize: rawFile.size,
    message: "Validating file…",
  });

  validateFile(rawFile);

  // 2. Automatic compression (images resized to <= 2560px & re-encoded to WebP/JPEG)
  onProgress?.({
    state: "compressing",
    progressPercent: 20,
    fileName: rawFile.name,
    originalSize: rawFile.size,
    compressedSize: rawFile.size,
    message: "Compressing…",
  });

  const stats = await compressFileWithStats(rawFile);
  const targetFile = stats.file;
  const savingsLabel = stats.wasCompressed ? formatCompressionSavings(stats) : undefined;

  // 3. Initiate Firebase upload with uploadBytesResumable
  const fullPath = `${basePath}/${crypto.randomUUID()}-${safeName(targetFile.name)}`;
  const storageRef = ref(storage, fullPath);

  onProgress?.({
    state: "uploading",
    progressPercent: 0,
    fileName: targetFile.name,
    originalSize: stats.originalSize,
    compressedSize: stats.compressedSize,
    savingsLabel,
    message: "Uploading…",
  });

  const uploadTask = uploadBytesResumable(storageRef, targetFile, {
    contentType: targetFile.type || "application/octet-stream",
    customMetadata: {
      ...customMetadata,
      uploaderId: uid,
      originalName: rawFile.name,
      originalSize: String(stats.originalSize),
      compressedSize: String(stats.compressedSize),
      wasCompressed: String(stats.wasCompressed),
    },
  });

  return new Promise<ManagedUploadResult>((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const percent = Math.round(
          (snapshot.bytesTransferred / Math.max(1, snapshot.totalBytes)) * 100,
        );
        onProgress?.({
          state: "uploading",
          progressPercent: percent,
          fileName: targetFile.name,
          originalSize: stats.originalSize,
          compressedSize: stats.compressedSize,
          savingsLabel,
          message: `Uploading… (${percent}%)`,
        });
      },
      (error) => {
        onProgress?.({
          state: "error",
          progressPercent: 0,
          fileName: targetFile.name,
          originalSize: stats.originalSize,
          compressedSize: stats.compressedSize,
          savingsLabel,
          message: error.message,
        });
        reject(error);
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          onProgress?.({
            state: "completed",
            progressPercent: 100,
            fileName: targetFile.name,
            originalSize: stats.originalSize,
            compressedSize: stats.compressedSize,
            savingsLabel,
            message: "Upload completed!",
          });

          resolve({
            path: fullPath,
            url: downloadUrl,
            fileName: targetFile.name.slice(0, 180),
            mimeType: targetFile.type || "application/octet-stream",
            sizeBytes: stats.compressedSize,
            originalSizeBytes: stats.originalSize,
            wasCompressed: stats.wasCompressed,
            savingsLabel,
          });
        } catch (err) {
          reject(err);
        }
      },
    );
  });
}

export async function uploadAssignmentAttachment(
  assignmentId: string,
  file: File,
  uid: string,
  onProgress?: UploadProgressCallback,
): Promise<ManagedUploadResult> {
  return uploadManagedFile(
    `assignments/${assignmentId}/${uid}`,
    file,
    uid,
    { assignmentId },
    onProgress,
  );
}

export async function uploadSubmissionAttachment(
  assignmentId: string,
  file: File,
  uid: string,
  onProgress?: UploadProgressCallback,
): Promise<ManagedUploadResult> {
  return uploadManagedFile(
    `submissions/${assignmentId}/${uid}`,
    file,
    uid,
    { assignmentId },
    onProgress,
  );
}

export async function uploadClassResource(
  classId: string,
  file: File,
  uid: string,
  onProgress?: UploadProgressCallback,
): Promise<ManagedUploadResult> {
  return uploadManagedFile(`class-resources/${classId}/${uid}`, file, uid, { classId }, onProgress);
}

export async function uploadAnnouncementAttachment(
  announcementId: string,
  file: File,
  uid: string,
  onProgress?: UploadProgressCallback,
): Promise<ManagedUploadResult> {
  return uploadManagedFile(
    `announcements/${announcementId}/${uid}`,
    file,
    uid,
    { announcementId },
    onProgress,
  );
}

export async function uploadProjectFile(
  projectId: string,
  file: File,
  uid: string,
  onProgress?: UploadProgressCallback,
): Promise<ManagedUploadResult> {
  return uploadManagedFile(`projects/${projectId}/${uid}`, file, uid, { projectId }, onProgress);
}

export async function uploadProfileAvatar(
  file: File,
  uid: string,
  onProgress?: UploadProgressCallback,
): Promise<ManagedUploadResult> {
  return uploadManagedFile(`avatars/${uid}`, file, uid, { purpose: "avatar" }, onProgress);
}

export async function uploadQuizImage(
  quizId: string,
  file: File,
  uid: string,
  onProgress?: UploadProgressCallback,
): Promise<ManagedUploadResult> {
  return uploadManagedFile(`quizzes/${quizId}/${uid}`, file, uid, { quizId }, onProgress);
}

export async function removeStorageFile(path: string): Promise<void> {
  await deleteObject(ref(storage, path));
}

export const MAX_FILE_BYTES = UPLOAD_LIMITS.MAX_DOCUMENT_MB * 1024 * 1024;
export { formatBytes, UPLOAD_LIMITS };
