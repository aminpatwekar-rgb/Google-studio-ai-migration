import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";
import type { AppRole } from "@/lib/firebase/models";

export async function getCallerAuthority(userId: string, email?: string | null) {
  const { adminDb } = await import("@/lib/firebase/admin");
  let superAdminUid: string | undefined;
  try {
    const configDoc = await adminDb.collection("system").doc("config").get();
    superAdminUid = configDoc.data()?.superAdminUid;

    // Bootstrap fallback if no superAdminUid is set yet
    if (!superAdminUid && email === "aminpatwekar@gmail.com") {
      await adminDb.collection("system").doc("config").set(
        {
          superAdminUid: userId,
          initializedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      superAdminUid = userId;
    }
  } catch {
    // ignore
  }

  const isSuperAdmin = Boolean(superAdminUid && userId === superAdminUid) || email === "aminpatwekar@gmail.com";

  let role: AppRole = "student";
  let userIsAdmin = false;
  try {
    const userDoc = await adminDb.collection("users").doc(userId).get();
    if (userDoc.exists) {
      const data = userDoc.data()!;
      role = data.role || "student";
      userIsAdmin = data.role === "admin" || data.isSuperAdmin === true;
    }
  } catch {
    // ignore
  }

  const isAdmin = isSuperAdmin || userIsAdmin;
  return { isAdmin, isSuperAdmin, superAdminUid, role };
}

export async function writeAuditLog(who: string, action: string, target: string, details?: any) {
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb.collection("audit_logs").add({
      who,
      action,
      target,
      details: details || null,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // ignore
  }
}

export const claimSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { adminDb } = await import("@/lib/firebase/admin");
    const configRef = adminDb.collection("system").doc("config");
    const configSnap = await configRef.get();
    const existingSa = configSnap.data()?.superAdminUid;

    if (existingSa && existingSa !== context.userId) {
      throw new Error("Super Admin is already claimed by another user.");
    }

    await configRef.set(
      {
        superAdminUid: context.userId,
        initializedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    await adminDb.collection("users").doc(context.userId).set(
      {
        role: "admin",
        isSuperAdmin: true,
      },
      { merge: true },
    );

    await writeAuditLog(context.userId, "claim_super_admin", context.userId);
    return { ok: true };
  });

export const deletePlatformUser = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: { userId: string }) => {
    if (!input || typeof input.userId !== "string" || input.userId.length < 5) {
      throw new Error("A valid user id is required");
    }
    return { userId: input.userId };
  })
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) {
      throw new Error("You cannot delete your own account");
    }

    const authState = await getCallerAuthority(context.userId, context.email);
    if (!authState.isAdmin) {
      throw new Error("Forbidden: only administrators can delete users.");
    }

    // Check if target is Super Admin
    if (data.userId === authState.superAdminUid) {
      throw new Error(
        "Forbidden: The Super Admin account is permanently protected and cannot be deleted.",
      );
    }

    // Regular admin cannot delete another admin
    const targetDoc = await adminDb.collection("users").doc(data.userId).get();
    const targetData = targetDoc.data();
    if (targetData?.role === "admin" && !authState.isSuperAdmin) {
      throw new Error("Forbidden: Only the Super Admin can delete other administrators.");
    }

    // 1. Delete Firebase Auth user
    try {
      await adminAuth.deleteUser(data.userId);
    } catch {
      // Auth user might already be deleted
    }

    // 2. Remove user from classes (studentIds and teacherIds / teacherNames)
    const classesSnap = await adminDb.collection("classes").get();
    const batch = adminDb.batch();
    for (const classDoc of classesSnap.docs) {
      const cData = classDoc.data();
      let changed = false;
      const studentIds = (cData.studentIds || []).filter((id: string) => id !== data.userId);
      if (studentIds.length !== (cData.studentIds || []).length) changed = true;

      const teacherIds = (cData.teacherIds || []).filter((id: string) => id !== data.userId);
      if (teacherIds.length !== (cData.teacherIds || []).length) changed = true;

      const teacherNames = { ...(cData.teacherNames || {}) };
      if (teacherNames[data.userId]) {
        delete teacherNames[data.userId];
        changed = true;
      }

      if (changed) {
        batch.update(classDoc.ref, { studentIds, teacherIds, teacherNames });
      }
    }
    await batch.commit();

    // 3. Delete submissions, notifications, leaderboard
    const subSnap = await adminDb
      .collection("submissions")
      .where("studentId", "==", data.userId)
      .get();
    const subBatch = adminDb.batch();
    for (const sDoc of subSnap.docs) {
      subBatch.delete(sDoc.ref);
    }
    await subBatch.commit();

    const notifSnap = await adminDb
      .collection("notifications")
      .where("userId", "==", data.userId)
      .get();
    const notifBatch = adminDb.batch();
    for (const nDoc of notifSnap.docs) {
      notifBatch.delete(nDoc.ref);
    }
    await notifBatch.commit();

    try {
      await adminDb.collection("leaderboard").doc(data.userId).delete();
    } catch {
      // ignore
    }

    // 4. Delete user profile doc
    await adminDb.collection("users").doc(data.userId).delete();

    // 5. Audit log
    await writeAuditLog(context.userId, "delete_user", data.userId, { email: targetData?.email });

    return { ok: true };
  });

export const setPlatformUserRole = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: { userId: string; role: AppRole }) => {
    if (!input || typeof input.userId !== "string" || !input.userId) {
      throw new Error("A valid user id is required");
    }
    if (!["admin", "teacher", "student"].includes(input.role)) {
      throw new Error("A valid role is required");
    }
    return { userId: input.userId, role: input.role };
  })
  .handler(async ({ data, context }) => {
    const authState = await getCallerAuthority(context.userId, context.email);
    if (!authState.isAdmin) {
      throw new Error("Forbidden: only administrators can modify user roles.");
    }

    const targetDoc = await adminDb.collection("users").doc(data.userId).get();
    const targetData = targetDoc.data();
    const targetRole = targetData?.role;
    const isTargetSuperAdmin =
      data.userId === authState.superAdminUid || targetData?.isSuperAdmin === true;

    if (isTargetSuperAdmin && data.role !== "admin") {
      throw new Error("Forbidden: The Super Admin is permanently protected and cannot be demoted.");
    }

    // Only Super Admin can promote someone to admin or change an existing admin's role
    if ((data.role === "admin" || targetRole === "admin") && !authState.isSuperAdmin) {
      throw new Error(
        "Forbidden: Only the Super Admin can promote users to admin or modify administrator roles.",
      );
    }

    await adminDb.collection("users").doc(data.userId).update({
      role: data.role,
    });

    await writeAuditLog(context.userId, "change_role", data.userId, {
      newRole: data.role,
      previousRole: targetRole,
    });

    return { ok: true };
  });

export const transferSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: { newSuperAdminUserId: string }) => {
    if (!input || typeof input.newSuperAdminUserId !== "string" || !input.newSuperAdminUserId) {
      throw new Error("A valid target user ID is required");
    }
    return { newSuperAdminUserId: input.newSuperAdminUserId };
  })
  .handler(async ({ data, context }) => {
    const authState = await getCallerAuthority(context.userId, context.email);
    if (!authState.isSuperAdmin) {
      throw new Error("Forbidden: Only the current Super Admin can transfer ownership.");
    }

    if (data.newSuperAdminUserId === context.userId) {
      throw new Error("You are already the Super Admin.");
    }

    const targetUserDoc = await adminDb.collection("users").doc(data.newSuperAdminUserId).get();
    if (!targetUserDoc.exists) {
      throw new Error("Target user account not found.");
    }

    // Update system config
    await adminDb.collection("system").doc("config").set(
      {
        superAdminUid: data.newSuperAdminUserId,
        transferredAt: new Date().toISOString(),
        transferredBy: context.userId,
      },
      { merge: true },
    );

    // Update target user
    await adminDb.collection("users").doc(data.newSuperAdminUserId).set(
      {
        role: "admin",
        isSuperAdmin: true,
      },
      { merge: true },
    );

    // Update old super admin
    await adminDb.collection("users").doc(context.userId).set(
      {
        isSuperAdmin: false,
      },
      { merge: true },
    );

    await writeAuditLog(context.userId, "transfer_super_admin", data.newSuperAdminUserId);

    return { ok: true };
  });
