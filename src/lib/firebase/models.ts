export type AppRole = "admin" | "teacher" | "student";

export interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  role: AppRole;
  classIds: string[];
  createdAt: string;
  plan?: string;
  avatarUrl?: string | null;
  institution?: string | null;
  rollNo?: string | null;
  erNo?: string | null;
  srNo?: string | null;
}

export interface ClassRoom {
  id: string;
  name: string;
  teacherId: string;
  teacherName?: string;
  teacherIds?: string[];
  teacherNames?: Record<string, string>;
  studentIds: string[];
  joinCode: string;
  createdAt: string;
  description?: string;
  subject?: string;
  section?: string;
  archived?: boolean;
}

export interface Assignment {
  id: string;
  classId: string;
  title: string;
  description: string;
  instructions?: string;
  subject?: string;
  dueDate: string;
  maxPoints: number;
  createdBy: string;
  createdAt: string;
  published?: boolean;
  archived?: boolean;
  groupAssignment?: boolean;
  submissionType?: "handwritten" | "typed" | "either";
  autoCorrect?: boolean;
  voiceTyping?: boolean;
  linksAllowed?: boolean;
  imagesAllowed?: boolean;
  rubricId?: string | null;
  referenceLinks?: string[];
}

export interface AssignmentAttachment {
  id: string;
  assignmentId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  uploadedBy: string;
  createdAt: string;
}

export interface QuizQuestion {
  id: string;
  type: "multiple_choice" | "single_choice" | "math_equation" | "text";
  text: string;
  options?: string[];
  points: number;
  correctAnswer?: string;
}

export interface Quiz {
  id: string;
  classId: string;
  title: string;
  questions: QuizQuestion[];
  timeLimit: number;
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
  refId: string;
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
