import { createServerFn } from "@tanstack/react-start";
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  const apps = getApps();
  if (apps.length) return apps[0]!;
  return initializeApp({ credential: applicationDefault() });
}

const adminApp = getAdminApp();
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);

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
