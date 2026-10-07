import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { auth } from "./config";

/**
 * Function middleware for authenticated server functions.
 *  - client: ensures Firebase Auth is ready, then attaches ID token as `Authorization: Bearer <token>`
 *  - server: verifies the token with firebase-admin and exposes `userId` / `email` in context
 */
export const requireFirebaseAuth = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    if (typeof window !== "undefined") {
      if (!auth.currentUser && typeof (auth as any).authStateReady === "function") {
        try {
          await (auth as any).authStateReady();
        } catch (e) {
          console.warn("authStateReady failed:", e);
        }
      }
    }
    const token = await auth.currentUser?.getIdToken().catch((e) => {
      console.error("getIdToken failed:", e);
      return null;
    });
    if (!token) {
      console.warn("requireFirebaseAuth: No token found for current user.");
    }
    return next(token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  })
  .server(async ({ next }) => {
    const request = getRequest();
    const header = request.headers.get("authorization") ?? "";
    if (!header.startsWith("Bearer ")) {
      throw new Error("Unauthorized: Missing or invalid Authorization header");
    }

    const idToken = header.slice(7).trim();
    if (!idToken) {
      throw new Error("Unauthorized: Bearer token is empty");
    }

    try {
      const { adminAuth } = await import("./admin");
      const decoded = await adminAuth.verifyIdToken(idToken);
      return next({ context: { userId: decoded.uid, email: decoded.email } });
    } catch (err: any) {
      console.error("Auth Middleware Error:", err);
      throw new Error(`Unauthorized: ${err.message || "Invalid token"}`);
    }
  });

/**
 * Optional Firebase Auth middleware that gracefully handles both authenticated and unauthenticated callers.
 */
export const optionalFirebaseAuth = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    if (typeof window !== "undefined") {
      if (!auth.currentUser && typeof (auth as any).authStateReady === "function") {
        try {
          await (auth as any).authStateReady();
        } catch {
          // ignore
        }
      }
    }
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    return next(token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  })
  .server(async ({ next }) => {
    const request = getRequest();
    const header = request.headers.get("authorization") ?? "";
    let userId: string | null = null;
    let email: string | null = null;

    if (header.startsWith("Bearer ")) {
      const idToken = header.slice(7).trim();
      if (idToken) {
        try {
          const { adminAuth } = await import("./admin");
          const decoded = await adminAuth.verifyIdToken(idToken);
          userId = decoded.uid;
          email = decoded.email ?? null;
        } catch {
          userId = null;
          email = null;
        }
      }
    }

    return next({ context: { userId, email } });
  });
