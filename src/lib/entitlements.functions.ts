import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth, optionalFirebaseAuth } from "@/lib/firebase/auth-middleware";

export type EntitlementLimits = {
  max_classes: number;
  max_students_per_class: number;
  ai_questions_per_month: number;
  storage_bytes: number;
  question_bank_total: number;
  assignments: number; // -1 for unlimited
  quizzes: number; // -1 for unlimited
  manual_questions: number; // ALWAYS -1 (Unlimited in ONYX)
};

export type EntitlementSummary = {
  userId: string | null;
  role: string;
  plan: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isUnlimited: boolean;
  limits: EntitlementLimits;
  features: Record<string, boolean>;
  aiUsage: {
    used: number;
    limit: number;
    remaining: number;
    resetDate: string;
    isUnlimited: boolean;
  };
  storageUsage: {
    usedBytes: number;
    limitBytes: number;
    percentage: number;
    isWarn: boolean;
    isExceeded: boolean;
    isUnlimited: boolean;
  };
};

function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getNextMonthResetDate(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString().slice(0, 10);
}

/**
 * Retrieves authoritative user entitlements, plan limits, AI quota, and storage accounting.
 */
export const getUserEntitlements = createServerFn({ method: "GET" })
  .middleware([optionalFirebaseAuth])
  .handler(async ({ context }): Promise<EntitlementSummary> => {
    const { adminDb } = await import("@/lib/firebase/admin");
    let role = "student";
    let plan = "free";
    let isSuperAdmin = false;
    let isAdmin = false;

    const currentUserId = context?.userId ?? null;
    const currentUserEmail = context?.email ?? null;

    if (currentUserEmail === "aminpatwekar@gmail.com") {
      isSuperAdmin = true;
      isAdmin = true;
      role = "admin";
      plan = "super_admin";
    }

    if (currentUserId) {
      try {
        const userDoc = await adminDb.collection("users").doc(currentUserId).get();
        if (userDoc.exists) {
          const u = userDoc.data()!;
          role = u.role || role;
          plan = (u.plan || plan).toLowerCase();
        }
      } catch {
        // Safe fallback if user doc read encounters permission limitations
      }

      if (!isSuperAdmin) {
        try {
          const configDoc = await adminDb.collection("system").doc("config").get();
          const superAdminUid = configDoc.data()?.superAdminUid;
          if (superAdminUid && currentUserId === superAdminUid) {
            isSuperAdmin = true;
            isAdmin = true;
          }
        } catch {
          // Safe fallback if system config doc read encounters permission limitations
        }
      }
    }

    if (role === "admin" || currentUserEmail === "aminpatwekar@gmail.com") {
      isAdmin = true;
    }

    const isUnlimited = isSuperAdmin || isAdmin || plan === "institution";
    const monthKey = getCurrentMonthKey();
    const resetDate = getNextMonthResetDate();

    // AI Usage Fetch
    let aiUsed = 0;
    const aiLimit = isUnlimited ? -1 : plan === "pro" ? 500 : 20;

    if (currentUserId) {
      try {
        const usageSnap = await adminDb
          .collection("usage")
          .doc(`${currentUserId}_${monthKey}`)
          .get();
        if (usageSnap.exists) {
          aiUsed = Number(usageSnap.data()?.ai_questions_used || 0);
        }
      } catch {
        // Safe fallback if usage document is unavailable
      }
    }

    const aiRemaining = isUnlimited ? 999999 : Math.max(0, aiLimit - aiUsed);

    // Storage Usage Fetch
    let storageUsed = 0;
    const storageLimit = isUnlimited
      ? -1
      : plan === "pro"
        ? 10 * 1024 * 1024 * 1024 // 10 GB
        : 500 * 1024 * 1024; // 500 MB

    if (currentUserId) {
      try {
        const storageSnap = await adminDb.collection("storage_usage").doc(currentUserId).get();
        if (storageSnap.exists) {
          storageUsed = Number(storageSnap.data()?.usedBytes || 0);
        }
      } catch {
        // Safe fallback if storage usage document is unavailable
      }
    }

    const storagePercentage =
      storageLimit > 0 ? Math.min(100, (storageUsed / storageLimit) * 100) : 0;
    const isWarn = storagePercentage >= 80;
    const isExceeded = storageLimit > 0 && storageUsed >= storageLimit;

    const allFeatures = [
      "question_bank",
      "advanced_grading",
      "rubrics",
      "attendance",
      "calendar",
      "notifications",
      "advanced_analytics",
      "csv_import",
      "csv_export",
      "quiz_randomization",
      "time_attempt_controls",
      "lockdown",
      "progress_reports",
      "remove_branding",
      "unlimited_storage",
    ];

    const featureFlags: Record<string, boolean> = {};
    for (const f of allFeatures) {
      if (isUnlimited) {
        featureFlags[f] = true;
      } else if (plan === "pro") {
        featureFlags[f] = true;
      } else {
        featureFlags[f] = ["calendar", "notifications"].includes(f);
      }
    }

    return {
      userId: currentUserId,
      role,
      plan,
      isSuperAdmin,
      isAdmin,
      isUnlimited,
      limits: {
        max_classes: isUnlimited ? -1 : plan === "pro" ? 10 : 2,
        max_students_per_class: isUnlimited ? -1 : plan === "pro" ? 150 : 30,
        ai_questions_per_month: aiLimit,
        storage_bytes: storageLimit,
        question_bank_total: isUnlimited ? -1 : plan === "pro" ? 1000 : 50,
        assignments: -1, // ALWAYS UNLIMITED
        quizzes: -1, // ALWAYS UNLIMITED
        manual_questions: -1, // ALWAYS UNLIMITED
      },
      features: featureFlags,
      aiUsage: {
        used: aiUsed,
        limit: aiLimit,
        remaining: aiRemaining,
        resetDate,
        isUnlimited,
      },
      storageUsage: {
        usedBytes: storageUsed,
        limitBytes: storageLimit,
        percentage: storagePercentage,
        isWarn,
        isExceeded,
        isUnlimited,
      },
    };
  });

export const isUnlimitedUser = (
  userData: any,
  email: string | null,
  userId: string,
  config?: { superAdminUid?: string },
): boolean => {
  const isSuperAdmin = userId === config?.superAdminUid || email === "aminpatwekar@gmail.com";
  const isAdmin = userData.role === "admin" || isSuperAdmin;
  const plan = (userData.plan || "free").toLowerCase();
  return isSuperAdmin || isAdmin || plan === "institution";
};

/**
 * Consumes AI question generation quota server-side atomically.
 * Manual questions consume 0 quota.
 */
export async function consumeAiQuestionQuota(
  userId: string,
  count: number,
  email?: string | null,
): Promise<{ remaining: number; used: number }> {
  if (count <= 0) return { remaining: 999999, used: 0 };

  const { adminDb } = await import("@/lib/firebase/admin");
  const monthKey = getCurrentMonthKey();
  const usageRef = adminDb.collection("usage").doc(`${userId}_${monthKey}`);

  try {
    const userDoc = await adminDb.collection("users").doc(userId).get();
    const userData = userDoc.data() || {};
    
    const configDoc = await adminDb.collection("system").doc("config").get();
    const configData = configDoc.data() || {};
    
    const isUnlimited = isUnlimitedUser(userData, email, userId, configData);
    const plan = (userData.plan || "free").toLowerCase();
    const limit = isUnlimited ? -1 : plan === "pro" ? 500 : 20;

    return await adminDb.runTransaction(async (tx: any) => {
      const snap = await tx.get(usageRef);
      const curUsed = snap.exists ? Number(snap.data()?.ai_questions_used || 0) : 0;

      if (!isUnlimited && curUsed + count > limit) {
        const remaining = Math.max(0, limit - curUsed);
        throw new Error(
          `Monthly AI question quota exceeded. You have ${remaining} AI questions remaining this month. Manual questions are unlimited.`,
        );
      }

      const nextUsed = curUsed + count;
      tx.set(
        usageRef,
        {
          userId,
          monthKey,
          ai_questions_used: nextUsed,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      const remaining = isUnlimited ? 999999 : Math.max(0, limit - nextUsed);
      return { remaining, used: nextUsed };
    });
  } catch (error: any) {
    console.error("Firestore error in consumeAiQuestionQuota:", error);
    throw error;
  }
}

/**
 * Tracks storage usage delta (in bytes) when files are uploaded or deleted.
 */
export async function trackStorageUsageDelta(
  userId: string,
  bytesDelta: number,
  email?: string | null,
): Promise<{ usedBytes: number; limitBytes: number }> {
  const { adminDb } = await import("@/lib/firebase/admin");
  const storageRef = adminDb.collection("storage_usage").doc(userId);
  const userDoc = await adminDb.collection("users").doc(userId).get();
  const userData = userDoc.data() || {};
  const isUnlimited = isUnlimitedUser(userData, email, userId);
  const plan = (userData.plan || "free").toLowerCase();
  const limitBytes = isUnlimited
    ? -1
    : plan === "pro"
      ? 10 * 1024 * 1024 * 1024
      : 500 * 1024 * 1024;

  return await adminDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(storageRef);
    const curUsed = snap.exists ? Number(snap.data()?.usedBytes || 0) : 0;
    const nextUsed = Math.max(0, curUsed + bytesDelta);

    if (bytesDelta > 0 && !isUnlimited && limitBytes > 0 && nextUsed > limitBytes) {
      throw new Error(
        "Storage quota exceeded. Please free up space or upgrade to Pro for 10 GB of storage.",
      );
    }

    tx.set(
      storageRef,
      {
        userId,
        usedBytes: nextUsed,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return { usedBytes: nextUsed, limitBytes };
  });
}
