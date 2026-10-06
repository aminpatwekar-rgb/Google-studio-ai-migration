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
      rollNo: text(row["roll_no"] || row["RollNo"] || row["rollNo"]),
      erNo: text(row["er_no"] || row["ErNo"] || row["erNo"]),
      srNo: text(row["sr_no"] || row["SrNo"] || row["srNo"]),
    }));

    const { FieldValue } = await import("firebase-admin/firestore");
    const studentIds = new Set<string>((klass["studentIds"] as string[] | undefined) ?? []);
    const skippedRows: { line: number; reason: string }[] = [];
    let imported = 0;

    for (const row of normalized) {
      if (!row.email) {
        skippedRows.push({ line: row.line, reason: "Email is required" });
        continue;
      }
      // Only existing ONYX accounts can be enrolled: a student's class access is tied to their
      // sign-in id, so we never invent placeholder accounts.
      const usersSnap = await adminDb.collection("users").where("email", "==", row.email).limit(1).get();
      const studentDoc = usersSnap.docs[0];
      if (!studentDoc) {
        skippedRows.push({ line: row.line, reason: `No ONYX account found for ${row.email}` });
        continue;
      }
      if (studentDoc.data()["role"] !== "student") {
        skippedRows.push({ line: row.line, reason: `${row.email} is not a student account` });
        continue;
      }
      if (studentIds.has(studentDoc.id)) {
        skippedRows.push({ line: row.line, reason: `${row.email} is already in this class` });
        continue;
      }

      studentIds.add(studentDoc.id);
      await studentDoc.ref.set(
        {
          classIds: FieldValue.arrayUnion(data.classId),
          ...(row.rollNo ? { rollNo: row.rollNo } : {}),
          ...(row.erNo ? { erNo: row.erNo } : {}),
          ...(row.srNo ? { srNo: row.srNo } : {}),
        },
        { merge: true },
      );
      imported += 1;
    }

    await adminDb
      .collection("classes")
      .doc(data.classId)
      .update({ studentIds: Array.from(studentIds) });

    return {
      imported,
      skipped: skippedRows.length,
      total: normalized.length,
      skippedRows,
    };
  });

export const getPlanSummary = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    let role = "student";
    let plan = "free";

    if (context.userId) {
      const snap = await adminDb.collection("users").doc(context.userId).get();
      if (snap.exists) {
        const u = snap.data()!;
        role = u.role || "student";
        plan = u.plan || "free";
      }
    }

    const isAdmin = role === "admin" || context.email === "aminpatwekar@gmail.com";

    const defaultPlans = [
      {
        code: "free",
        name: "Free",
        monthly_price_inr: 0,
        limits: { max_classes: 2, max_students_per_class: 30 },
      },
      {
        code: "pro",
        name: "Pro",
        monthly_price_inr: 499,
        limits: { max_classes: 10, max_students_per_class: 150 },
      },
      {
        code: "institution",
        name: "Institution",
        monthly_price_inr: 1999,
        limits: { max_classes: -1, max_students_per_class: -1 },
      },
    ];

    const adminPlan = {
      code: "admin",
      name: "Admin",
      monthly_price_inr: 0,
      limits: { max_classes: -1, max_students_per_class: -1 },
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

    return {
      code: isAdmin ? "admin" : plan,
      plan: isAdmin ? adminPlan : defaultPlans.find((p) => p.code === plan) || defaultPlans[0],
      plans: defaultPlans,
      storageUsed: 0,
    };
  });
