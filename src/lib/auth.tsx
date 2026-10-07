import { useEffect, useState, createContext, useContext, type ReactNode, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut as fbSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase/config";
import type { AppRole, UserProfile } from "./firebase/models";
import { clearSessionConfirmation, markSessionConfirmed } from "./session-confirm";
import { provisionUserProfile } from "./firebase/auth.functions";
import { useServerFn } from "@tanstack/react-start";

export type { AppRole };

export type Profile = UserProfile & {
  full_name: string;
  er_no?: string | null;
  sr_no?: string | null;
  roll_no?: string | null;
};

export type AppUser = FirebaseUser & {
  id: string; // for compatibility with user.id callers
};

type AuthState = {
  session: { user: AppUser } | null;
  user: AppUser | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  needsRoleSelection: boolean;
  isSuperAdmin: boolean;
  superAdminUid: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<Profile | null>;
  signUpWithEmail: (email: string, pass: string, fullName: string, role?: AppRole) => Promise<void>;
  completeSignUp: (desiredRole: "student" | "teacher", fullName?: string) => Promise<Profile>;
  signInAsGuest: (desiredRole?: AppRole) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  profile: null,
  role: null,
  loading: true,
  needsRoleSelection: false,
  isSuperAdmin: false,
  superAdminUid: null,
  signInWithGoogle: async () => {},
  signInWithEmail: async () => null,
  signUpWithEmail: async () => {},
  completeSignUp: async () => {
    throw new Error("AuthProvider not ready");
  },
  signInAsGuest: async () => {},
  signOut: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [needsRoleSelection, setNeedsRoleSelection] = useState(false);
  const [loading, setLoading] = useState(true);
  const [superAdminUid, setSuperAdminUid] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const provision = useServerFn(provisionUserProfile);

  const loadProfile = useCallback(
    async (fbUser: FirebaseUser): Promise<Profile | null> => {
      const isAdminEmail = fbUser.email === "aminpatwekar@gmail.com";
      const userRef = doc(db, "users", fbUser.uid);
      const snap = await getDoc(userRef);

      const configRef = doc(db, "system", "config");
      const configSnap = await getDoc(configRef);
      const saUid = configSnap.exists() ? configSnap.data()?.superAdminUid || null : null;
      setSuperAdminUid(saUid);

      let saUidCurrent = saUid;
      if (isAdminEmail && saUidCurrent !== fbUser.uid) {
        try {
          // Direct Firestore Client SDK writes to system/config
          await setDoc(
            configRef,
            {
              superAdminUid: fbUser.uid,
              initializedAt: new Date().toISOString(),
            },
            { merge: true },
          );

          // Direct Firestore Client SDK writes to users/{uid}
          await setDoc(
            userRef,
            {
              role: "admin",
              email: fbUser.email,
              name: fbUser.displayName || fbUser.email?.split("@")[0] || "Admin",
              id: fbUser.uid,
            },
            { merge: true },
          );

          // Invoke the server function as a fallback to guarantee write with full Admin SDK privileges
          try {
            const idToken = await fbUser.getIdToken();
            await provision({
              data: {
                idToken,
                fullName: fbUser.displayName || "Admin",
                desiredRole: "teacher",
              },
            });
          } catch (serverErr) {
            console.warn("Server side auto-provision fallback message:", serverErr);
          }

          saUidCurrent = fbUser.uid;
          setSuperAdminUid(saUidCurrent);
        } catch (e) {
          console.error("Failed to self-heal Super Admin via Client SDK:", e);
        }
      }

      const superAdminState = saUidCurrent
        ? fbUser.uid === saUidCurrent
        : fbUser.email === "aminpatwekar@gmail.com";
      setIsSuperAdmin(superAdminState);

      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        const effectiveRole: AppRole = isAdminEmail ? "admin" : data.role || "student";
        const p: Profile = {
          ...data,
          id: fbUser.uid,
          name: data.name || fbUser.displayName || fbUser.email?.split("@")[0] || "User",
          full_name: data.name || fbUser.displayName || fbUser.email?.split("@")[0] || "User",
          email: fbUser.email,
          role: effectiveRole,
          classIds: data.classIds || [],
          createdAt: data.createdAt || new Date().toISOString(),
          roll_no: data.rollNo || null,
        };
        setProfile(p);
        setRole(p.role);
        setNeedsRoleSelection(false);
        return p;
      } else if (isAdminEmail) {
        // Platform administrator auto-provisioning
        const idToken = await fbUser.getIdToken();
        const result = await provision({
          data: {
            idToken,
            fullName: fbUser.displayName || "Admin",
            desiredRole: "teacher",
          },
        });
        const newProfile = result.profile as UserProfile;
        const p: Profile = {
          ...newProfile,
          full_name: newProfile.name,
          email: fbUser.email,
          role: "admin",
          roll_no: newProfile.rollNo ?? null,
        };
        setProfile(p);
        setRole("admin");
        setNeedsRoleSelection(false);
        return p;
      } else {
        // A new user MUST go through sign up / role selection (Teacher or Student).
        // Do NOT auto-provision as student or allow direct entry into the app!
        setProfile(null);
        setRole(null);
        setNeedsRoleSelection(true);
        clearSessionConfirmation();
        return null;
      }
    },
    [provision],
  );

  const completeSignUp = async (
    desiredRole: "student" | "teacher",
    fullName?: string,
  ): Promise<Profile> => {
    if (!auth.currentUser) throw new Error("No active user session found");
    const fbUser = auth.currentUser;
    const finalName =
      fullName?.trim() || fbUser.displayName || fbUser.email?.split("@")[0] || "User";
    const isAdminEmail = fbUser.email === "aminpatwekar@gmail.com";
    const assignedRole: AppRole = isAdminEmail ? "admin" : desiredRole;

    const userRef = doc(db, "users", fbUser.uid);
    const profileData: UserProfile = {
      id: fbUser.uid,
      name: finalName,
      email: fbUser.email ?? null,
      role: assignedRole,
      classIds: [],
      createdAt: new Date().toISOString(),
      plan: "Free",
      avatarUrl: fbUser.photoURL ?? null,
      institution: null,
      rollNo: null,
      erNo: null,
      srNo: null,
    };

    let saved = false;
    let serverProfile: UserProfile | undefined;

    // 1. Directly save to Firestore with authenticated user credentials
    try {
      await setDoc(userRef, profileData, { merge: true });
      saved = true;
    } catch (clientErr) {
      console.warn("Direct Firestore setDoc note, fallback to server provision:", clientErr);
    }

    // 2. Also invoke server function with Admin SDK
    try {
      const idToken = await fbUser.getIdToken();
      const res = await provision({
        data: {
          idToken,
          fullName: finalName,
          desiredRole: assignedRole === "teacher" ? "teacher" : "student",
        },
      });
      if (res?.profile) {
        serverProfile = res.profile as UserProfile;
        saved = true;
      }
    } catch (e) {
      console.warn("Server provisioning note:", e);
      if (!saved) {
        throw new Error(
          e instanceof Error ? e.message : "Failed to finish registration. Please try again.",
        );
      }
    }

    const effectiveData = serverProfile || profileData;
    const p: Profile = {
      ...effectiveData,
      role: assignedRole,
      full_name: finalName,
    };
    setProfile(p);
    setRole(p.role);
    setNeedsRoleSelection(false);
    markSessionConfirmed(fbUser.uid);
    return p;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const enrichedUser = Object.assign(fbUser, { id: fbUser.uid }) as AppUser;
        setUser(enrichedUser);
        try {
          const loaded = await loadProfile(fbUser);
          if (loaded) {
            markSessionConfirmed(fbUser.uid);
          } else {
            clearSessionConfirmation();
          }
        } catch (e) {
          console.error("Failed to load user profile:", e);
        }
      } else {
        setUser(null);
        setProfile(null);
        setRole(null);
        setNeedsRoleSelection(false);
        clearSessionConfirmation();
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [loadProfile]);

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      if (cred.user) {
        await loadProfile(cred.user);
      }
    } catch (err: any) {
      if (err?.code === "auth/operation-not-allowed") {
        throw new Error(
          "Google sign-in is disabled in your Firebase project. Please enable Google in Firebase Console > Authentication > Sign-in method.",
        );
      }
      throw err;
    }
  };

  const signInWithEmail = async (email: string, pass: string): Promise<Profile | null> => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      if (cred.user) {
        return await loadProfile(cred.user);
      }
      return null;
    } catch (err: any) {
      if (err?.code === "auth/operation-not-allowed") {
        throw new Error(
          "Email/Password sign-in is disabled in your Firebase project. Please enable Email/Password in Firebase Console > Authentication > Sign-in method.",
        );
      }
      throw err;
    }
  };

  const signUpWithEmail = async (
    email: string,
    pass: string,
    fullName: string,
    desiredRole: AppRole = "student",
  ) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const fbUser = cred.user;
      const isAdminEmail = fbUser.email === "aminpatwekar@gmail.com";
      const assignedRole: AppRole = isAdminEmail ? "admin" : desiredRole;

      const userRef = doc(db, "users", fbUser.uid);
      const profileData: UserProfile = {
        id: fbUser.uid,
        name: fullName.trim(),
        email: fbUser.email ?? null,
        role: assignedRole,
        classIds: [],
        createdAt: new Date().toISOString(),
        plan: "Free",
        avatarUrl: null,
        institution: null,
        rollNo: null,
        erNo: null,
        srNo: null,
      };

      // 1. Directly write profile to Firestore
      await setDoc(userRef, profileData, { merge: true });

      // 2. Also invoke provision server function in background
      try {
        const idToken = await fbUser.getIdToken();
        await provision({
          data: {
            idToken,
            fullName: fullName.trim(),
            desiredRole: assignedRole === "teacher" ? "teacher" : "student",
          },
        });
      } catch (e) {
        console.warn("Server provisioning note:", e);
      }

      const p: Profile = {
        ...profileData,
        full_name: fullName.trim(),
      };
      setProfile(p);
      setRole(p.role);
      setNeedsRoleSelection(false);
      markSessionConfirmed(fbUser.uid);
    } catch (err: any) {
      if (err?.code === "auth/operation-not-allowed") {
        throw new Error(
          "Email/Password registration is disabled in your Firebase project. Please enable Email/Password in Firebase Console > Authentication > Sign-in method.",
        );
      }
      throw err;
    }
  };

  const signInAsGuest = async (_desiredRole: AppRole = "student") => {
    try {
      const cred = await signInAnonymously(auth);
      if (cred.user) {
        await loadProfile(cred.user);
      }
    } catch (err: any) {
      if (
        err?.code === "auth/admin-restricted-operation" ||
        err?.code === "auth/operation-not-allowed"
      ) {
        throw new Error(
          "Guest sign-in is disabled in Firebase. Please sign in with your email or Google account.",
        );
      }
      throw new Error(err?.message || "Guest sign-in failed. Please use email or Google sign in.");
    }
  };

  const signOut = async () => {
    await fbSignOut(auth);
    setUser(null);
    setProfile(null);
    setRole(null);
    setNeedsRoleSelection(false);
    setSuperAdminUid(null);
    setIsSuperAdmin(false);
    clearSessionConfirmation();
  };

  const refresh = async () => {
    if (auth.currentUser) {
      await loadProfile(auth.currentUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session: user ? { user } : null,
        user,
        profile,
        role,
        loading,
        needsRoleSelection,
        isSuperAdmin,
        superAdminUid,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        completeSignUp,
        signInAsGuest,
        signOut,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
