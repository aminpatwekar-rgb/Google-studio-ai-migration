import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./config";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

export async function uploadAssignmentAttachment(
  assignmentId: string,
  file: File,
  uid: string,
) {
  if (!file.size || file.size > MAX_FILE_BYTES) {
    throw new Error("Attachments must be smaller than 25 MB.");
  }

  const path = `assignments/${assignmentId}/${uid}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type || "application/octet-stream",
    customMetadata: {
      assignmentId,
      uploaderId: uid,
      originalName: file.name,
    },
  });

  return {
    path,
    url: await getDownloadURL(snapshot.ref),
    fileName: file.name.slice(0, 180),
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  };
}

export async function removeStorageFile(path: string) {
  await deleteObject(ref(storage, path));
}

export { MAX_FILE_BYTES };
