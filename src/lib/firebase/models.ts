export type AppRole = "admin" | "teacher" | "student";

export interface UserProfile {
  id: string; // uid
  name: string;
  email: string | null;
  role: AppRole;
  classIds: string[];
  createdAt: string;
  plan?: string;
  avatarUrl?: string | null;
  institution?: string | null;
  rollNo?: string | null;
}

export interface ClassRoom {
  id: string;
  name: string;
  teacherId: string;
  teacherName?: string;
  studentIds: string[];
  joinCode: string;
  createdAt: string;
  description?: string;
  subject?: string;
}

export interface Assignment {
  id: string;
  classId: string;
  title: string;
  description: string;
  dueDate: string;
  maxPoints: number;
  createdBy: string;
  createdAt: string;
}

export interface QuizQuestion {
  id: string;
  type: "multiple_choice" | "single_choice" | "math_equation" | "text";
  text: string;
  options?: string[];
  points: number;
  correctAnswer?: string; // used when editing/creating by teacher
}

export interface Quiz {
  id: string;
  classId: string;
  title: string;
  questions: QuizQuestion[];
  timeLimit: number; // in minutes
  createdBy: string;
  createdAt: string;
}

export interface QuizAnswerKey {
  answers: Record<string, string | number>;
  quizId: string;
  createdBy: string;
}

export interface Submission {
  id: string;
  type: "assignment" | "quiz";
  refId: string; // assignmentId or quizId
  classId: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  answers: any;
  submittedAt: string;
  status: "submitted" | "graded";
  score: number | null;
  feedback: string | null;
  gradedBy: string | null;
  gradedAt: string | null;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  points: number;
  criteria?: string;
  createdAt?: string;
}

export interface UserEarnedAchievement {
  id: string;
  achievementId: string;
  title: string;
  description: string;
  icon: string;
  points: number;
  earnedAt: string;
}

export interface LeaderboardEntry {
  userId: string;
  userName: string;
  role?: string;
  score: number;
  totalSubmissions: number;
  rank?: number;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amount: number;
  plan: string;
  status: "created" | "authorized" | "captured" | "failed";
  createdAt: string;
}
