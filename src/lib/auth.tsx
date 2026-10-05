import { useEffect, useState, createContext, useContext, type ReactNode, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
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
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, fullName: string, role?: AppRole) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  profile: null,
  role: null,
  loading: true,
  signInWithGoogle: async () => {},
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  signOut: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const provision = useServerFn(provisionUserProfile);

  const loadProfile = useCallback(async (fbUser: FirebaseUser): Promise<Profile> => {
    const userRef = doc(db, "users", fbUser.uid);
    const snap = await getDoc(userRef);

    const isAdminEmail = fbUser.email === "aminpatwekar@gmail.com";

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
      return p;
    } else {
      const idToken = await fbUser.getIdToken();
      const result = await provision({
        data: {
          idToken,
          fullName: fbUser.displayName || "",
          desiredRole: "student",
        },
      });
      const newProfile = result.profile as UserProfile;
      const p: Profile = {
        ...newProfile,
        full_name: newProfile.name,
        email: fbUser.email,
        roll_no: newProfile.rollNo ?? null,
      };
      setProfile(p);
      setRole(p.role);
      return p;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const enrichedUser = Object.assign(fbUser, { id: fbUser.uid }) as AppUser;
        setUser(enrichedUser);
        try {
          await loadProfile(fbUser);
          markSessionConfirmed(fbUser.uid);
        } catch (e) {
          console.error("Failed to load user profile:", e);
        }
      } else {
        setUser(null);
        setProfile(null);
        setRole(null);
        clearSessionConfirmation();
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [loadProfile]);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    if (cred.user) {
      await loadProfile(cred.user);
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    if (cred.user) {
      await loadProfile(cred.user);
    }
  };

  const signUpWithEmail = async (
    email: string,
    pass: string,
    fullName: string,
    desiredRole: AppRole = "student",
  ) => {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const fbUser = cred.user;
    const isAdminEmail = fbUser.email === "aminpatwekar@gmail.com";
    const assignedRole: AppRole = isAdminEmail ? "admin" : desiredRole;

    const idToken = await fbUser.getIdToken();
    const result = await provision({
      data: {
        idToken,
        fullName,
        desiredRole: assignedRole === "teacher" ? "teacher" : "student",
      },
    });
    const newProfile = result.profile as UserProfile;
    const p: Profile = {
      ...newProfile,
      full_name: newProfile.name,
      email: fbUser.email,
      roll_no: newProfile.rollNo ?? null,
    };
    setProfile(p);
    setRole(p.role);
  };

  const signOut = async () => {
    await fbSignOut(auth);
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
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
