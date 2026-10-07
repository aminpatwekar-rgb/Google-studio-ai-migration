import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";
import { adminDb } from "@/lib/firebase/admin";
import { csvObjects } from "@/lib/csv";

function text(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeEmail(v: unknown) {
  return text(v).toLowerCase();
}

export const importStudentsFromCsv = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: { classId: string; csv: string }) => {
    if (!input.classId || typeof input.classId !== "string") throw new Error("Class is required.");
    if (typeof input.csv !== "string" || input.csv.length > 2_000_000) {
      throw new Error("CSV is missing or too large.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const classDoc = await adminDb.collection("classes").doc(data.classId).get();
    if (!classDoc.exists) throw new Error("Class not found.");

    const klass = classDoc.data()!;
    const userDoc = await adminDb.collection("users").doc(context.userId).get();
    const userData = userDoc.data();
    const isAdmin = userData?.role === "admin" || context.email === "aminpatwekar@gmail.com";

    if (klass.teacherId !== context.userId && !isAdmin) {
      throw new Error("You are not allowed to import students into this class.");
    }

    const rows = csvObjects(data.csv);
    if (!rows.length) throw new Error("The CSV has no student rows.");
    if (rows.length > 500) throw new Error("Import up to 500 students at a time.");

    const normalized = rows.map((row, index) => ({
      line: index + 2,
      email: normalizeEmail(row["email"] || row["Email"]),
      fullName: text(row["full_name"] || row["name"] || row["Name"] || row["FullName"]),
      rollNo: text(row["roll_no"] || row["RollNo"] || row["rollNo"] || row["Roll No"]),
      erNo: text(row["er_no"] || row["ErNo"] || row["erNo"] || row["ER No"]),
      srNo: text(row["sr_no"] || row["SrNo"] || row["srNo"] || row["SR No"]),
    }));

    const skippedRows: { line: number; reason: string }[] = [];
    const validRows: typeof normalized = [];

    for (const r of normalized) {
      if (!r.email) {
        skippedRows.push({ line: r.line, reason: "Missing email address" });
      } else if (!r.fullName) {
        skippedRows.push({ line: r.line, reason: "Missing student name" });
      } else {
        validRows.push(r);
      }
    }

    const studentIds: string[] = klass.studentIds || [];
    let addedCount = 0;

    for (const row of validRows) {
      // Find or create user
      const usersSnap = await adminDb
        .collection("users")
        .where("email", "==", row.email)
        .limit(1)
        .get();
      let studentId = "";
      if (!usersSnap.empty) {
        studentId = usersSnap.docs[0]!.id;
        // Merge roll/er/sr if provided
        await adminDb
          .collection("users")
          .doc(studentId)
          .set(
            {
              rollNo: row.rollNo || usersSnap.docs[0]!.data()?.rollNo || null,
              erNo: row.erNo || usersSnap.docs[0]!.data()?.erNo || null,
              srNo: row.srNo || usersSnap.docs[0]!.data()?.srNo || null,
            },
            { merge: true },
          );
      } else {
        const newRef = adminDb.collection("users").doc();
        studentId = newRef.id;
        await newRef.set({
          id: studentId,
          name: row.fullName,
          email: row.email,
          role: "student",
          classIds: [data.classId],
          createdAt: new Date().toISOString(),
          rollNo: row.rollNo || null,
          erNo: row.erNo || null,
          srNo: row.srNo || null,
        });
      }

      if (!studentIds.includes(studentId)) {
        studentIds.push(studentId);
        addedCount++;
        const currentStudentDoc = await adminDb.collection("users").doc(studentId).get();
        const curClassIds: string[] = currentStudentDoc.data()?.classIds || [];
        if (!curClassIds.includes(data.classId)) {
          await adminDb
            .collection("users")
            .doc(studentId)
            .set(
              {
                classIds: [...curClassIds, data.classId],
              },
              { merge: true },
            );
        }
      }
    }

    await adminDb.collection("classes").doc(data.classId).update({ studentIds });

    return {
      imported: addedCount,
      importedCount: addedCount,
      skipped: skippedRows.length,
      skippedCount: skippedRows.length,
      total: normalized.length,
      totalRows: normalized.length,
      skippedRows,
    };
  });

import { optionalFirebaseAuth } from "@/lib/firebase/auth-middleware";

export const getPlanSummary = createServerFn({ method: "GET" })
  .middleware([optionalFirebaseAuth])
  .handler(async ({ context }) => {
    let role = "student";
    let plan = "free";
    let isSuperAdmin = false;
    let isAdmin = false;

    const currentUserId = context?.userId;
    const currentUserEmail = context?.email;

    if (currentUserEmail === "aminpatwekar@gmail.com") {
      isSuperAdmin = true;
      isAdmin = true;
      role = "admin";
      plan = "super_admin";
    }

    if (currentUserId) {
      try {
        const snap = await adminDb.collection("users").doc(currentUserId).get();
        if (snap.exists) {
          const u = snap.data()!;
          role = u.role || role;
          plan = u.plan || plan;
          if (u.isSuperAdmin === true) {
            isSuperAdmin = true;
            isAdmin = true;
          }
        }
      } catch {
        // Safe fallback if user doc read encounters permission limitations
      }

      if (!isSuperAdmin) {
        try {
          const configSnap = await adminDb.collection("system").doc("config").get();
          const superAdminUid = configSnap.data()?.superAdminUid;
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

    const defaultPlans = [
      {
        code: "free",
        name: "Free",
        badge: "Starter",
        monthly_price_inr: 0,
        annual_price_inr: 0,
        description: "Essential classroom and assignment tools for getting started.",
        limits: {
          max_classes: 2,
          max_students_per_class: 30,
          ai_questions_per_month: 20,
          storage_bytes: 500 * 1024 * 1024, // 500 MB
          question_bank_total: 50,
        },
        features: {
          rubrics: false,
          attendance: false,
          advanced_grading: false,
          advanced_analytics: false,
          csv_import: false,
          csv_export: false,
          quiz_randomization: false,
          progress_reports: false,
        },
      },
      {
        code: "pro",
        name: "Pro",
        badge: "Most Popular",
        monthly_price_inr: 499,
        annual_price_inr: 4999,
        description: "Advanced grading, AI generation, and analytics for active educators.",
        limits: {
          max_classes: 10,
          max_students_per_class: 150,
          ai_questions_per_month: 500,
          storage_bytes: 10 * 1024 * 1024 * 1024, // 10 GB
          question_bank_total: 1000,
        },
        features: {
          rubrics: true,
          attendance: true,
          advanced_grading: true,
          advanced_analytics: true,
          csv_import: true,
          csv_export: true,
          quiz_randomization: true,
          progress_reports: true,
        },
      },
      {
        code: "institution",
        name: "Institution",
        badge: "Enterprise",
        monthly_price_inr: 1999,
        annual_price_inr: 19999,
        description: "Full institutional capacity for schools, colleges, and departments.",
        limits: {
          max_classes: -1,
          max_students_per_class: -1,
          ai_questions_per_month: -1,
          storage_bytes: -1,
          question_bank_total: -1,
        },
        features: {
          rubrics: true,
          attendance: true,
          advanced_grading: true,
          advanced_analytics: true,
          csv_import: true,
          csv_export: true,
          quiz_randomization: true,
          progress_reports: true,
          custom_branding: true,
          sso: true,
        },
      },
    ];

    const superAdminPlan = {
      code: "super_admin",
      name: "Super Admin (Unlimited Access)",
      badge: "Unlimited Master Tier",
      monthly_price_inr: 0,
      annual_price_inr: 0,
      description:
        "Permanent unrestricted Super Admin access with infinite classes, students, AI, storage, and all platform features.",
      isUnlimited: true,
      limits: {
        max_classes: -1,
        max_students_per_class: -1,
        ai_questions_per_month: -1,
        storage_bytes: -1,
        question_bank_total: -1,
        assignments: -1,
        quizzes: -1,
        rubrics: -1,
      },
      features: Object.fromEntries(
        [
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
          "priority_ai",
          "unlimited_storage",
          "institution_management",
          "super_admin_controls",
        ].map((key) => [key, true]),
      ),
    };

    const adminPlan = {
      code: "admin",
      name: "Admin (Unlimited Access)",
      badge: "Admin Access",
      monthly_price_inr: 0,
      annual_price_inr: 0,
      description: "Full administrator privileges with unlimited classes, tools, and features.",
      isUnlimited: true,
      limits: {
        max_classes: -1,
        max_students_per_class: -1,
        ai_questions_per_month: -1,
        storage_bytes: -1,
        question_bank_total: -1,
      },
      features: Object.fromEntries(
        [
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
        ].map((key) => [key, true]),
      ),
    };

    const activePlan = isSuperAdmin
      ? superAdminPlan
      : isAdmin
        ? adminPlan
        : defaultPlans.find((p) => p.code === plan.toLowerCase()) || defaultPlans[0];

    return {
      code: isSuperAdmin ? "super_admin" : isAdmin ? "admin" : plan,
      isSuperAdmin,
      isAdmin,
      isUnlimited: isSuperAdmin || isAdmin,
      plan: activePlan,
      plans: defaultPlans,
      storageUsed: 0,
    };
  });
