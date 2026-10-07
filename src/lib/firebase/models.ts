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
  isSuperAdmin?: boolean;
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
  bannerUrl?: string | null;
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
  filesAllowed?: boolean;
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
  imageUrl?: string;
}

export type QuizKind = "practice" | "timed" | "scheduled" | "exam";

export interface Quiz {
  id: string;
  classId: string;
  title: string;
  kind?: QuizKind;
  questions: QuizQuestion[];
  timeLimit: number;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  lockdown?: boolean;
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

export interface ProjectTask {
  id: string;
  title: string;
  description?: string;
  assignedTo?: string; // userId
  status: "todo" | "in_progress" | "completed";
  dueDate?: string | null;
}

export interface ProjectMilestone {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
}

export interface Project {
  id: string;
  classId: string;
  title: string;
  description: string;
  createdBy: string;
  memberIds: string[]; // student UIDs in group
  status: "planning" | "in_progress" | "review" | "completed";
  tasks: ProjectTask[];
  milestones: ProjectMilestone[];
  progressPercent: number;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorEmail?: string | null;
  action: string;
  targetType: "user" | "class" | "assignment" | "quiz" | "role" | "system" | "payment";
  targetId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  timestamp: string;
}
