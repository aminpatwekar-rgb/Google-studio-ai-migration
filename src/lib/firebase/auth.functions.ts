import { createServerFn } from "@tanstack/react-start";

// firebase-admin is loaded lazily inside the handler so it can never end up in the browser bundle.
async function getAdmin() {
  const [{ getApps, initializeApp, applicationDefault }, { getAuth }, { getFirestore }] =
    await Promise.all([
      import("firebase-admin/app"),
      import("firebase-admin/auth"),
      import("firebase-admin/firestore"),
    ]);
  const { default: firebaseConfig } = await import("../../../firebase-applet-config.json");
  const app =
    getApps()[0] ??
    initializeApp({ credential: applicationDefault(), projectId: firebaseConfig.projectId });
  return { adminAuth: getAuth(app), adminDb: getFirestore(app, firebaseConfig.firestoreDatabaseId) };
}

export type ProvisionProfileInput = {
  idToken: string;
  fullName?: string;
  desiredRole?: "student" | "teacher";
};

export const provisionUserProfile = createServerFn({ method: "POST" })
  .validator((input: ProvisionProfileInput) => {
    if (!input?.idToken) throw new Error("Authentication token is required");
    return {
      idToken: String(input.idToken),
      fullName: String(input.fullName ?? "").trim().slice(0, 120),
      desiredRole: input.desiredRole === "teacher" ? "teacher" : "student",
    };
  })
  .handler(async ({ data }) => {
    const { adminAuth, adminDb } = await getAdmin();
    const decoded = await adminAuth.verifyIdToken(data.idToken);
    const uid = decoded.uid;
    const userRef = adminDb.collection("users").doc(uid);
    const configRef = adminDb.collection("system").doc("config");

    const result = await adminDb.runTransaction(async (tx) => {
      const [userSnap, configSnap] = await Promise.all([tx.get(userRef), tx.get(configRef)]);
      if (userSnap.exists) {
        return userSnap.data();
      }

      const config = configSnap.exists ? configSnap.data() : undefined;
      const superAdminUid = config?.superAdminUid as string | undefined;
      const role = superAdminUid ? data.desiredRole : "admin";
      const profile = {
        id: uid,
        name: data.fullName || decoded.name || decoded.email?.split("@")[0] || "User",
        email: decoded.email ?? null,
        role,
        classIds: [],
        createdAt: new Date().toISOString(),
        plan: "Free",
        avatarUrl: decoded.picture ?? null,
        institution: null,
        rollNo: null,
        erNo: null,
        srNo: null,
      };

      tx.set(userRef, profile);
      if (!superAdminUid) {
        tx.set(configRef, {
          superAdminUid: uid,
          initializedAt: new Date().toISOString(),
        }, { merge: true });
      }
      return profile;
    });

    return { profile: result };
  });
