import { createMiddleware } from "@tanstack/react-start";
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  const apps = getApps();
  if (apps.length) return apps[0]!;
  return initializeApp({ credential: applicationDefault() });
}

const adminApp = getAdminApp();
export const adminAuth = getAdminAuth(adminApp);
export const adminDb = getAdminFirestore(adminApp);

export const requireFirebaseAuth = createMiddleware().server(async ({ next, request }) => {
  const header =
    request.headers?.get("authorization") || request.headers?.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }

  const idToken = header.slice(7).trim();
  if (!idToken) throw new Error("Unauthorized");

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return next({
      context: {
        userId: decoded.uid,
        email: decoded.email,
      },
    });
  } catch {
    throw new Error("Unauthorized");
  }
});
