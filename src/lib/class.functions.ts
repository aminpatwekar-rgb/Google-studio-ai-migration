import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";
import { adminDb } from "@/lib/firebase/admin";

type ImportStudent = {
  email: string;
  full_name: string;
  roll_no?: string;
  er_no?: string;
  sr_no?: string;
};

export const importClassStudents = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: { classId: string; students: ImportStudent[] }) => {
    if (!input || typeof input.classId !== "string" || !Array.isArray(input.students)) {
      throw new Error("Invalid student import");
    }
    if (input.students.length > 500) throw new Error("CSV is limited to 500 students at a time");
    return {
      classId: input.classId,
      students: input.students.map((s) => ({
        email: String(s.email ?? "")
          .trim()
          .toLowerCase(),
        full_name: String(s.full_name ?? "").trim(),
        roll_no: String(s.roll_no ?? "").trim(),
        er_no: String(s.er_no ?? "").trim(),
        sr_no: String(s.sr_no ?? "").trim(),
      })),
    };
  })
  .handler(async ({ data, context }) => {
    const classDoc = await adminDb.collection("classes").doc(data.classId).get();
    if (!classDoc.exists) throw new Error("Class not found");
    const classData = classDoc.data();

    const callerDoc = await adminDb.collection("users").doc(context.userId).get();
    const callerData = callerDoc.data();
    const isTeacher = classData?.teacherId === context.userId;
    const isAdmin = callerData?.role === "admin" || context.email === "aminpatwekar@gmail.com";

    if (!isTeacher && !isAdmin) {
      throw new Error("Only the class teacher or an administrator can import students");
    }

    const { FieldValue } = await import("firebase-admin/firestore");
    const userDocs = await adminDb.collection("users").get();
    const byEmail = new Map<string, { id: string; name: string }>();

    userDocs.forEach((d) => {
      const u = d.data();
      if (u.email) {
        byEmail.set(u.email.toLowerCase(), { id: d.id, name: u.name });
      }
    });

    const results = { imported: 0, skipped: 0, errors: [] as string[] };
    const newStudentIds = new Set<string>(classData?.studentIds || []);

    for (const [index, student] of data.students.entries()) {
      if (!student.email) {
        results.skipped += 1;
        results.errors.push(`Row ${index + 2}: email is required`);
        continue;
      }
      const existingUser = byEmail.get(student.email);
      if (!existingUser) {
        results.skipped += 1;
        results.errors.push(`Row ${index + 2}: no account found for ${student.email}`);
        continue;
      }

      newStudentIds.add(existingUser.id);
      // Update student's user profile with classId and rollNo if provided
      await adminDb
        .collection("users")
        .doc(existingUser.id)
        .set(
          {
            classIds: FieldValue.arrayUnion(data.classId),
            rollNo: student.roll_no || null,
          },
          { merge: true },
        );
      results.imported += 1;
    }

    await adminDb
      .collection("classes")
      .doc(data.classId)
      .update({
        studentIds: Array.from(newStudentIds),
      });

    return results;
  });
