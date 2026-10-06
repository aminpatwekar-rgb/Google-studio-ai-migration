export type AppRole = "admin" | "teacher" | "student";

export interface OnyxNotification {
  id: string;
  userId: string;
  type: "announcement" | "assignment" | "grade" | "quiz" | "system";
  title: string;
  body: string;
  classId?: string;
  refId?: string;
  read: boolean;
  createdAt: string;
}

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

/** Legacy ids (multiple_choice…) are still readable; new quizzes use the R1 type names. */
export type StoredQuestionType =
  | "mcq"
  | "multi_select"
  | "true_false"
  | "fill_blank"
  | "short_answer"
  | "essay"
  | "multiple_choice"
  | "single_choice"
  | "math_equation"
  | "text";

export interface QuizQuestion {
  id: string;
  type: StoredQuestionType;
  /** Question text. Legacy quizzes call this `text`; new quizzes write both. */
  text: string;
  prompt?: string;
  options?: string[];
  points: number;
  difficulty?: "easy" | "medium" | "hard";
  correctAnswer?: string;
}

export type QuizKindId = "practice" | "timed" | "scheduled" | "exam";

export interface Quiz {
  id: string;
  classId: string;
  title: string;
  description?: string;
  questions: QuizQuestion[];
  /** Minutes. 0 / undefined = untimed. */
  timeLimit: number;
  createdBy: string;
  createdAt: string;
  kind?: QuizKindId;
  maxAttempts?: number;
  passingMarks?: number | null;
  lockdownEnabled?: boolean;
  randomizeQuestions?: boolean;
  randomizeChoices?: boolean;
  showResults?: boolean;
  startAt?: string | null;
  endAt?: string | null;
  /** Quizzes created before drafts existed have no flag and count as published. */
  published?: boolean;
  archived?: boolean;
  totalMarks?: number;
  updatedAt?: string;
}

/** Private doc at quizzes/{id}/keys/answerKey — never readable by students. */
export interface QuizAnswerKey {
  /** Legacy single-answer map. */
  answers: Record<string, string | number>;
  /** Accepted answers per question (supports multi-select and several accepted spellings). */
  correct?: Record<string, string[]>;
  explanations?: Record<string, string>;
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
  maxScore?: number | null;
  attemptNo?: number;
  resultDetails?: Record<string, { answer: string[]; correct: boolean | null; marks: number }>;
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
