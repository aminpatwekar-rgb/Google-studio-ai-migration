import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./config";
import type {
  UserProfile,
  ClassRoom,
  Assignment,
  Quiz,
  QuizAnswerKey,
  Submission,
  Achievement,
  UserEarnedAchievement,
  LeaderboardEntry,
  PaymentRecord,
  AppRole,
  OnyxNotification,
} from "./models";

/** Recursively removes undefined properties so Firestore never throws `Unsupported field value: undefined` */
export function cleanFirestoreData<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) {
    return data.map((item) => cleanFirestoreData(item)) as unknown as T;
  }
  if (typeof data === "object" && !(data instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleaned[key] = cleanFirestoreData(value);
      }
    }
    return cleaned as T;
  }
  return data;
}

// ================= USER PROFILES =================

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<UserProfile, "id">) };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function createUserProfile(
  uid: string,
  data: Partial<UserProfile>,
): Promise<UserProfile> {
  const path = `users/${uid}`;
  try {
    const profile: UserProfile = cleanFirestoreData({
      id: uid,
      name: data.name || "User",
      email: data.email || null,
      role: data.role || "student",
      classIds: data.classIds || [],
      createdAt: new Date().toISOString(),
      plan: data.plan || "Free",
      avatarUrl: data.avatarUrl || null,
      institution: data.institution || null,
      rollNo: data.rollNo || null,
    });
    await setDoc(doc(db, "users", uid), profile);
    return profile;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
  const path = `users/${uid}`;
  try {
    const cleaned = cleanFirestoreData(updates);
    if (Object.keys(cleaned).length > 0) {
      await updateDoc(doc(db, "users", uid), cleaned);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const path = "users";
  try {
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UserProfile, "id">) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function updateUserRole(targetUid: string, role: AppRole): Promise<void> {
  const path = `users/${targetUid}`;
  try {
    await updateDoc(doc(db, "users", targetUid), { role });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// ================= CLASSES =================

export async function getClass(classId: string): Promise<ClassRoom | null> {
  const path = `classes/${classId}`;
  try {
    const snap = await getDoc(doc(db, "classes", classId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<ClassRoom, "id">) };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function getTeacherClasses(teacherId: string): Promise<ClassRoom[]> {
  const path = "classes";
  try {
    const [ownerSnap, memberSnap] = await Promise.all([
      getDocs(query(collection(db, "classes"), where("teacherId", "==", teacherId))),
      getDocs(query(collection(db, "classes"), where("teacherIds", "array-contains", teacherId))),
    ]);
    const byId = new Map<string, ClassRoom>();
    for (const snap of [ownerSnap, memberSnap]) {
      for (const d of snap.docs) byId.set(d.id, { id: d.id, ...(d.data() as Omit<ClassRoom, "id">) });
    }
    return Array.from(byId.values());
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getStudentClasses(studentId: string): Promise<ClassRoom[]> {
  const path = "classes";
  try {
    const q = query(collection(db, "classes"), where("studentIds", "array-contains", studentId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassRoom, "id">) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getAllClasses(): Promise<ClassRoom[]> {
  const path = "classes";
  try {
    const snap = await getDocs(collection(db, "classes"));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassRoom, "id">) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function createClass(data: Omit<ClassRoom, "id">): Promise<string> {
  const path = "classes";
  try {
    const ref = doc(collection(db, "classes"));
    const newClass: ClassRoom = cleanFirestoreData({
      ...data,
      id: ref.id,
      name: data.name || "Untitled Class",
      teacherId: data.teacherId,
      teacherName: data.teacherName || "Teacher",
      teacherIds: data.teacherIds || [data.teacherId],
      teacherNames: data.teacherNames || { [data.teacherId]: data.teacherName || "Teacher" },
      studentIds: data.studentIds || [],
      joinCode: data.joinCode || Math.random().toString(36).substring(2, 8).toUpperCase(),
      createdAt: data.createdAt || new Date().toISOString(),
      description: data.description || "",
      subject: data.subject || "",
    });
    await setDoc(ref, newClass);
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function joinClassByCode(userId: string, joinCode: string, profile?: { fullName?: string; rollNo?: string; erNo?: string; srNo?: string }, role: "student" | "teacher" | "admin" = "student"): Promise<ClassRoom> {
  const path = "classes";
  try {
    const q = query(
      collection(db, "classes"),
      where("joinCode", "==", joinCode.trim().toUpperCase()),
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      throw new Error("No class found with that join code. Please check and try again.");
    }
    const classDoc = snap.docs[0];
    if (!classDoc) {
      throw new Error("Class could not be loaded.");
    }
    const classData = classDoc.data() as ClassRoom;
    const teacherIds = classData.teacherIds || [classData.teacherId];
    if (teacherIds.includes(userId)) throw new Error("Class owners and co-teachers cannot join their own class.");
    if (role === "student") {
      if (!profile?.rollNo?.trim() && !profile?.erNo?.trim() && !profile?.srNo?.trim()) throw new Error("Add at least one Roll No, ER No, or SR No before joining a class.");
      if (classData.studentIds?.includes(userId)) return { id: classDoc.id, ...classData };
      await updateDoc(doc(db, "classes", classDoc.id), { studentIds: arrayUnion(userId) });
    } else {
      await updateDoc(doc(db, "classes", classDoc.id), {
        teacherIds: arrayUnion(userId),
        [`teacherNames.${userId}`]: profile?.fullName?.trim()?.slice(0, 120) || "Teacher",
      });
    }
    await updateDoc(doc(db, "users", userId), {
      classIds: arrayUnion(classDoc.id),
      ...(profile?.fullName?.trim() ? { name: profile.fullName.trim().slice(0, 120) } : {}),
      ...(profile?.rollNo?.trim() ? { rollNo: profile.rollNo.trim().slice(0, 64) } : {}),
      ...(profile?.erNo?.trim() ? { erNo: profile.erNo.trim().slice(0, 64) } : {}),
      ...(profile?.srNo?.trim() ? { srNo: profile.srNo.trim().slice(0, 64) } : {}),
    });
    return {
      id: classDoc.id,
      ...classData,
      studentIds: role === "student" ? [...(classData.studentIds || []), userId] : classData.studentIds || [],
      teacherIds: role === "student" ? teacherIds : [...new Set([...teacherIds, userId])],
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function addCoTeacher(classId: string, teacherId: string, teacherName: string): Promise<void> {
  const path = `classes/${classId}`;
  try {
    await updateDoc(doc(db, "classes", classId), {
      teacherIds: arrayUnion(teacherId),
      [`teacherNames.${teacherId}`]: teacherName.trim().slice(0, 120),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function removeCoTeacher(classId: string, teacherId: string): Promise<void> {
  const path = `classes/${classId}`;
  try {
    const snap = await getDoc(doc(db, "classes", classId));
    if (!snap.exists()) throw new Error("Class not found");
    const data = snap.data() as ClassRoom;
    if (data.teacherId === teacherId) throw new Error("The class owner cannot leave the class.");
    const teacherIds = (data.teacherIds || [data.teacherId]).filter((id) => id !== teacherId);
    const teacherNames = { ...(data.teacherNames || {}) };
    delete teacherNames[teacherId];
    await updateDoc(doc(db, "classes", classId), { teacherIds, teacherNames });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateClass(classId: string, data: Partial<ClassRoom>): Promise<void> {
  const path = `classes/${classId}`;
  try {
    const cleaned = cleanFirestoreData(data);
    if (Object.keys(cleaned).length > 0) {
      await updateDoc(doc(db, "classes", classId), cleaned);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteClass(classId: string): Promise<void> {
  const path = `classes/${classId}`;
  try {
    await deleteDoc(doc(db, "classes", classId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}


// ================= CLASS ROSTER =================

export async function getClassRoster(classId: string): Promise<UserProfile[]> {
  const klass = await getClass(classId);
  if (!klass) throw new Error("Class not found.");
  const ids = [...new Set(klass.studentIds || [])];
  if (!ids.length) return [];
  const profiles = await Promise.all(ids.map((id) => getUserProfile(id)));
  return profiles.filter((p): p is UserProfile => Boolean(p));
}

export function exportClassRosterCsv(roster: UserProfile[]): string {
  const header = ["Full Name", "Roll No", "ER No", "SR No"];
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [header, ...roster.map((u) => [u.name, u.rollNo, u.erNo, u.srNo])]
    .map((row) => row.map(escape).join(","))
    .join("\n");
}

// ================= NOTIFICATIONS =================

export async function createNotification(input: Omit<OnyxNotification, "id">): Promise<string> {
  const ref = doc(collection(db, "notifications"));
  await setDoc(ref, { ...input, id: ref.id });
  return ref.id;
}

export async function getNotifications(userId: string, limitCount = 50): Promise<OnyxNotification[]> {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OnyxNotification, "id">) }));
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await updateDoc(doc(db, "notifications", notificationId), { read: true });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const snap = await getDocs(query(collection(db, "notifications"), where("userId", "==", userId), where("read", "==", false)));
  if (snap.empty) return;
  await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { read: true })));
}

// ================= ASSIGNMENTS =================

export async function getAssignmentsByClass(classId: string): Promise<Assignment[]> {
  const path = "assignments";
  try {
    const q = query(collection(db, "assignments"), where("classId", "==", classId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Assignment, "id">) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getAllAssignments(): Promise<Assignment[]> {
  const path = "assignments";
  try {
    const snap = await getDocs(collection(db, "assignments"));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Assignment, "id">) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getAssignment(assignmentId: string): Promise<Assignment | null> {
  const path = `assignments/${assignmentId}`;
  try {
    const snap = await getDoc(doc(db, "assignments", assignmentId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<Assignment, "id">) };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function createAssignment(data: Omit<Assignment, "id">): Promise<string> {
  const path = "assignments";
  try {
    const ref = doc(collection(db, "assignments"));
    const assignment: Assignment = cleanFirestoreData({
      ...data,
      id: ref.id,
      title: data.title || "Untitled Assignment",
      description: data.description || "",
      dueDate: data.dueDate || new Date().toISOString(),
      maxPoints: data.maxPoints ?? 100,
      createdAt: new Date().toISOString(),
    });
    await setDoc(ref, assignment);
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateAssignment(
  assignmentId: string,
  data: Partial<Assignment>,
): Promise<void> {
  const path = `assignments/${assignmentId}`;
  try {
    const cleaned = cleanFirestoreData(data);
    if (Object.keys(cleaned).length > 0) {
      await updateDoc(doc(db, "assignments", assignmentId), cleaned);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteAssignment(assignmentId: string): Promise<void> {
  const path = `assignments/${assignmentId}`;
  try {
    await deleteDoc(doc(db, "assignments", assignmentId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ================= QUIZZES =================

export async function getQuizzesByClass(classId: string): Promise<Quiz[]> {
  const path = "quizzes";
  try {
    const q = query(collection(db, "quizzes"), where("classId", "==", classId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Quiz, "id">) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getAllQuizzes(): Promise<Quiz[]> {
  const path = "quizzes";
  try {
    const snap = await getDocs(collection(db, "quizzes"));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Quiz, "id">) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getQuiz(
  quizId: string,
  isTeacherOrAdmin: boolean = false,
): Promise<{ quiz: Quiz; answerKey?: QuizAnswerKey } | null> {
  const path = `quizzes/${quizId}`;
  try {
    const snap = await getDoc(doc(db, "quizzes", quizId));
    if (!snap.exists()) return null;
    const quiz = { id: snap.id, ...(snap.data() as Omit<Quiz, "id">) };

    let answerKey: QuizAnswerKey | undefined = undefined;
    if (isTeacherOrAdmin) {
      const keySnap = await getDoc(doc(db, "quizzes", quizId, "keys", "answerKey"));
      if (keySnap.exists()) {
        answerKey = keySnap.data() as QuizAnswerKey;
      }
    }

    return { quiz, answerKey };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function createQuiz(
  quizData: Omit<Quiz, "id">,
  answers: Record<string, string | number>,
): Promise<string> {
  const path = "quizzes";
  try {
    const quizRef = doc(collection(db, "quizzes"));
    // Strip correct answers from public questions list
    const sanitizedQuestions = (quizData.questions || []).map((q) => {
      const { correctAnswer, ...rest } = q;
      return cleanFirestoreData(rest);
    });

    const quiz: Quiz = cleanFirestoreData({
      ...quizData,
      id: quizRef.id,
      questions: sanitizedQuestions as any,
      timeLimit: quizData.timeLimit ?? 30,
      createdAt: new Date().toISOString(),
    });
    await setDoc(quizRef, quiz);

    // Save answerKey in private subcollection
    const keyRef = doc(db, "quizzes", quizRef.id, "keys", "answerKey");
    const keyData: QuizAnswerKey = cleanFirestoreData({
      answers: answers || {},
      quizId: quizRef.id,
      createdBy: quizData.createdBy,
    });
    await setDoc(keyRef, keyData);

    return quizRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateQuiz(
  quizId: string,
  quizData: Partial<Quiz>,
  answers?: Record<string, string | number>,
): Promise<void> {
  const path = `quizzes/${quizId}`;
  try {
    let toUpdate = { ...quizData };
    if (quizData.questions) {
      const sanitized = quizData.questions.map((q) => {
        const { correctAnswer, ...rest } = q;
        return cleanFirestoreData(rest);
      });
      toUpdate = { ...toUpdate, questions: sanitized as any };
    }
    const cleaned = cleanFirestoreData(toUpdate);
    if (Object.keys(cleaned).length > 0) {
      await updateDoc(doc(db, "quizzes", quizId), cleaned);
    }

    if (answers) {
      const keyRef = doc(db, "quizzes", quizId, "keys", "answerKey");
      await setDoc(keyRef, cleanFirestoreData({ answers, quizId }), { merge: true });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteQuiz(quizId: string): Promise<void> {
  const path = `quizzes/${quizId}`;
  try {
    await deleteDoc(doc(db, "quizzes", quizId));
    await deleteDoc(doc(db, "quizzes", quizId, "keys", "answerKey")).catch(() => {});
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ================= SUBMISSIONS =================

export async function getSubmissionsByRef(refId: string): Promise<Submission[]> {
  const path = "submissions";
  try {
    const q = query(collection(db, "submissions"), where("refId", "==", refId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, "id">) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getStudentSubmissions(studentId: string): Promise<Submission[]> {
  const path = "submissions";
  try {
    const q = query(collection(db, "submissions"), where("studentId", "==", studentId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, "id">) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getTeacherGradingQueue(teacherClassIds: string[]): Promise<Submission[]> {
  const path = "submissions";
  try {
    if (teacherClassIds.length === 0) return [];
    // Firestore in-query supports up to 30 items
    const classBatch = teacherClassIds.slice(0, 30);
    const q = query(collection(db, "submissions"), where("classId", "in", classBatch));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, "id">) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getSubmission(submissionId: string): Promise<Submission | null> {
  const path = `submissions/${submissionId}`;
  try {
    const snap = await getDoc(doc(db, "submissions", submissionId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<Submission, "id">) };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function createSubmission(data: Omit<Submission, "id">): Promise<string> {
  const path = "submissions";
  try {
    const ref = doc(collection(db, "submissions"));
    const submission: Submission = cleanFirestoreData({
      ...data,
      id: ref.id,
      submittedAt: new Date().toISOString(),
      status: data.status || "submitted",
      score: null,
      feedback: null,
      gradedBy: null,
      gradedAt: null,
    });
    await setDoc(ref, submission);
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function gradeSubmission(
  submissionId: string,
  score: number,
  feedback: string,
  teacherId: string,
): Promise<void> {
  const path = `submissions/${submissionId}`;
  try {
    if (!Number.isFinite(score) || score < 0) throw new Error("Score must be a valid non-negative number.");
    const snap = await getDoc(doc(db, "submissions", submissionId));
    if (!snap.exists()) throw new Error("Submission not found.");
    const sub = snap.data() as Submission;
    if (sub.type === "assignment") {
      const assignment = await getAssignment(sub.refId);
      if (!assignment) throw new Error("Assignment not found.");
      if (score > assignment.maxPoints) throw new Error(`Score cannot exceed ${assignment.maxPoints} points.`);
    }
    const gradedAt = new Date().toISOString();
    await updateDoc(doc(db, "submissions", submissionId), {
      status: "graded",
      score,
      feedback: feedback || null,
      gradedBy: teacherId,
      gradedAt,
    });

    // Update leaderboard entry for student
    {
      const userRef = doc(db, "leaderboard", sub.studentId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const cur = userSnap.data() as LeaderboardEntry;
        await setDoc(
          userRef,
          cleanFirestoreData({
            score: (cur.score || 0) + score,
            totalSubmissions: (cur.totalSubmissions || 0) + 1,
            updatedAt: gradedAt,
          }),
          { merge: true },
        );
      } else {
        await setDoc(
          userRef,
          cleanFirestoreData({
            userId: sub.studentId,
            userName: sub.studentName || "Student",
            score,
            totalSubmissions: 1,
            updatedAt: gradedAt,
          }),
        );
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// ================= LEADERBOARD =================

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const path = "leaderboard";
  try {
    const snap = await getDocs(collection(db, "leaderboard"));
    const list = snap.docs.map((d) => d.data() as LeaderboardEntry);
    list.sort((a, b) => (b.score || 0) - (a.score || 0));
    return list.map((item, index) => ({ ...item, rank: index + 1 }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

// ================= ACHIEVEMENTS =================

const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_submission",
    title: "First Step",
    description: "Submitted first assignment",
    icon: "Rocket",
    points: 50,
  },
  {
    id: "math_master",
    title: "Formula Wizard",
    description: "Solved an equation using the math editor",
    icon: "Calculator",
    points: 100,
  },
  {
    id: "quiz_champ",
    title: "Quiz Prodigy",
    description: "Scored 100% on a quiz",
    icon: "Trophy",
    points: 150,
  },
  {
    id: "streak_3",
    title: "Dedication",
    description: "Submitted 3 assignments on time",
    icon: "Flame",
    points: 200,
  },
  {
    id: "top_class",
    title: "Class Honor",
    description: "Ranked top 3 on the leaderboard",
    icon: "Star",
    points: 300,
  },
];

export async function getAchievements(): Promise<Achievement[]> {
  const path = "achievements";
  try {
    const snap = await getDocs(collection(db, "achievements"));
    if (snap.empty) {
      return DEFAULT_ACHIEVEMENTS;
    }
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Achievement, "id">) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getUserAchievements(userId: string): Promise<UserEarnedAchievement[]> {
  const path = `users/${userId}/achievements`;
  try {
    const snap = await getDocs(collection(db, "users", userId, "achievements"));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UserEarnedAchievement, "id">) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function awardAchievement(userId: string, achievement: Achievement): Promise<void> {
  const path = `users/${userId}/achievements/${achievement.id}`;
  try {
    const ref = doc(db, "users", userId, "achievements", achievement.id);
    const existing = await getDoc(ref);
    if (existing.exists()) return;

    const earned: UserEarnedAchievement = cleanFirestoreData({
      id: achievement.id,
      achievementId: achievement.id,
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
      points: achievement.points,
      earnedAt: new Date().toISOString(),
    });
    await setDoc(ref, earned);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// ================= PAYMENTS =================

export async function getUserPayments(userId: string): Promise<PaymentRecord[]> {
  const path = "payments";
  try {
    const q = query(collection(db, "payments"), where("userId", "==", userId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, "id">) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}
