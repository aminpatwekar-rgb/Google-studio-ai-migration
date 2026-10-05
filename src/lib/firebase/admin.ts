// SERVER-ONLY. Never import this from client components/hooks.
// Only import it from createServerFn handlers or middleware .server() callbacks.
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth as getAdminAuthSdk } from "firebase-admin/auth";
import { getFirestore as getAdminFirestoreSdk } from "firebase-admin/firestore";
import firebaseConfig from "../../../firebase-applet-config.json";

function getAdminApp() {
  return getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: firebaseConfig.projectId });
}

function lazy<T extends object>(factory: () => T): T {
  let instance: T | undefined;
  return new Proxy({} as T, {
    get(_t, prop) {
      instance ??= factory();
      const value = Reflect.get(instance as object, prop);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  });
}

export const adminAuth = /* @__PURE__ */ lazy(() => getAdminAuthSdk(getAdminApp()));
export const adminDb = /* @__PURE__ */ lazy(() => getAdminFirestoreSdk(getAdminApp(), firebaseConfig.firestoreDatabaseId));
