import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth, adminDb } from "@/lib/firebase/auth-middleware";

export const deletePlatformUser = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: { userId: string }) => {
    if (!input || typeof input.userId !== "string" || input.userId.length < 5) {
      throw new Error("A valid user id is required");
    }
    return { userId: input.userId };
  })
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) {
      throw new Error("You cannot delete your own account");
    }

    const callerDoc = await adminDb.collection("users").doc(context.userId).get();
    const callerData = callerDoc.data();
    const isAdmin = callerData?.role === "admin" || context.email === "aminpatwekar@gmail.com";

    if (!isAdmin) throw new Error("Forbidden: only administrators can delete users.");

    // Delete user profile from Firestore
    await adminDb.collection("users").doc(data.userId).delete();

    return { ok: true };
  });
