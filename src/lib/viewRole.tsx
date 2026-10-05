import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuth, type AppRole } from "@/lib/auth";

const STORAGE_KEY = "onyx_view_role";

type ViewRoleContextType = {
  viewRole: AppRole | null;
  setViewRole: (role: AppRole | null) => void;
  effectiveRole: AppRole | null;
  realRole: AppRole | null;
  isOverridden: boolean;
};

const ViewRoleContext = createContext<ViewRoleContextType>({
  viewRole: null,
  setViewRole: () => {},
  effectiveRole: null,
  realRole: null,
  isOverridden: false,
});

export function ViewRoleProvider({ children }: { children: ReactNode }) {
  const { role: realRole } = useAuth();

  const [viewRole, setViewRoleState] = useState<AppRole | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "student" || stored === "teacher" || stored === "admin") {
        return stored;
      }
    } catch {
      // Ignore localStorage errors
    }
    return null;
  });

  const setViewRole = (next: AppRole | null) => {
    setViewRoleState(next);
    try {
      if (next) {
        localStorage.setItem(STORAGE_KEY, next);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore localStorage errors
    }
  };

  // Derive effectiveRole strictly clamped by realRole:
  // - Admin can switch between admin, teacher, or student (defaults to "admin")
  // - Teacher can switch between teacher or student only (defaults to "teacher")
  // - Student can never switch (always "student")
  let effectiveRole: AppRole | null = null;
  if (realRole === "admin") {
    effectiveRole = viewRole ?? "admin";
  } else if (realRole === "teacher") {
    effectiveRole = viewRole === "student" ? "student" : "teacher";
  } else if (realRole === "student") {
    effectiveRole = "student";
  } else {
    effectiveRole = null;
  }

  const isOverridden = Boolean(realRole && effectiveRole && effectiveRole !== realRole);

  return (
    <ViewRoleContext.Provider
      value={{
        viewRole,
        setViewRole,
        effectiveRole,
        realRole,
        isOverridden,
      }}
    >
      {children}
    </ViewRoleContext.Provider>
  );
}

export function useViewRole() {
  const context = useContext(ViewRoleContext);
  if (!context) {
    throw new Error("useViewRole must be used within a ViewRoleProvider");
  }
  return context;
}
