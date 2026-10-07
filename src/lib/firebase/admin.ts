import { getApps, initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "../../../firebase-applet-config.json";

const apps = getApps();
const adminApp = apps.length > 0
  ? apps[0]
  : initializeApp({
      credential: applicationDefault(),
      projectId: firebaseConfig.projectId,
    });

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

console.log("Admin SDK initialized with project:", adminApp.options.projectId);
console.log("Admin SDK database ID:", firebaseConfig.firestoreDatabaseId);
// Test connection lazily or do not test to avoid blocking initialization.
console.log("Admin SDK initialized.");
