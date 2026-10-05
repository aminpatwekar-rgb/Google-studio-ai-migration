import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { auth } from "./config";

/**
 * Function middleware for authenticated server functions.
 *  - client: attaches the signed-in user's Firebase ID token as `Authorization: Bearer <token>`
 *  - server: verifies the token with firebase-admin and exposes `userId` / `email` in context
 *
 * firebase-admin is imported dynamically inside .server() so it never ends up in the browser
 * bundle. Import `adminDb` / `adminAuth` from "./admin" inside handlers instead.
 */
export const requireFirebaseAuth = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const token = await auth.currentUser?.getIdToken();
    return next(token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  })
  .server(async ({ next }) => {
    const request = getRequest();
    const header = request.headers.get("authorization") ?? "";
    if (!header.startsWith("Bearer ")) throw new Error("Unauthorized");

    const idToken = header.slice(7).trim();
    if (!idToken) throw new Error("Unauthorized");

    try {
      const { adminAuth } = await import("./admin");
      const decoded = await adminAuth.verifyIdToken(idToken);
      return next({ context: { userId: decoded.uid, email: decoded.email } });
    } catch {
      throw new Error("Unauthorized");
    }
  });
