# Smart Assignment Hub

Smart Assignment Submission & Tracking System

A handwriting-first assignment platform for schools and colleges, with Teacher, Student, and Admin roles. Built on Lovable Cloud (database, auth, file storage) with a premium Notion/Linear-inspired UI, dark/light mode, and smooth motion.

This is a large platform, so it ships in phases. Each phase leaves a working app.

Phase 1 — Foundation and core loop

Auth and roles

Email/password sign-up and login, email verification, forgot/reset password, Google sign-in.

Role chosen at sign-up: Student or Teacher. Admin is granted, not self-selected.

Roles stored in a dedicated roles table (never on the profile) for security.

Classes

Teacher creates classes with sections/groups and a join code.

Students join with the code; teacher sees the roster.

Assignments

Teacher creates: title, subject, description, instructions, due date, max marks, attachments (PDF/images), reference links, optional rubric, individual or group.

Submission type per assignment: handwritten only, typed only, or either. The typed writing page is always available to students regardless of the setting, and it never allows copy-paste.

Toggles per assignment: auto-correct on/off, voice typing on/off, links allowed on/off, images allowed on/off.

Submission

Handwritten: camera capture, phone/desktop upload, drag-and-drop, multi-page images or scanned PDF.

Typed: locked writing page — copy, paste, right-click, Ctrl+C/V, and text drag are blocked, and each attempt shows a visible warning toast; repeated attempts are counted and flagged to the teacher.

Images inside typed work: when the teacher has enabled images, students can insert project-related images (upload, camera, drag-and-drop) inline with a caption, reorder them, and delete them. Image drag-and-drop is allowed even though text paste is blocked. When images are disabled, the insert control is hidden and image uploads are rejected server-side.

Status lifecycle: Not Started, In Progress, Submitted, Late, Reviewed, Returned, Completed.

Overdue shows a red "Late by X days" warning.

Review and feedback

Teacher opens a submission, zooms and rotates pages, draws highlights/annotations, adds comments, awards marks, then returns or approves.

Student sees marks, comments, corrections, and improvement notes.

Dashboards

Student: upcoming, overdue, submitted, completion percentage, progress tracker, assignment cards showing subject, teacher, due date, priority, status.

Teacher: total classes, students, active assignments, pending submissions.

Design system

Dark/light theme, glassmorphism, soft shadows, rounded cards, generous spacing, modern typography, Framer Motion transitions, Lucide icons, fully responsive and keyboard navigable.

Color coding: green complete, yellow pending, red late, blue under review.

Phase 2 — Math notebook and rich composition

Notebook Mode: ruled-paper canvas where students write with stylus/mouse, mix handwriting, typed text, equations, diagrams, and images, and export as PDF.

AI Equation Builder: natural typing ("integral from 0 to 5 of x^2 dx") converted to rendered KaTeX; also "x squared" to x².

Handwriting-to-equation recognition with an editable result.

Smart symbol toolbar, quick fractions, matrix grid editor, geometry tools, coordinate plane.

Graph generator: type y=x^2, get a plot to insert.

Chemistry (H2SO4 to H₂SO₄, reaction arrows) and physics formula templates.

Formula library with search, plus AI formula lookup (teacher can disable).

Step-by-step workspace with auto-aligned equation lines.

Drawing canvas for graphs, flowcharts, block diagrams; image upload with crop.

Phase 3 — Analytics, calendar, notifications

Teacher charts: completion rate, submission trend, late submissions, average marks, student ranking.

Student charts: completion %, average score, late count, performance over time.

Monthly calendar: assignment deadlines, submission history, exam dates, project deadlines.

Notification center (in-app + email): assignment created, deadline changed, reviewed, marks published, reminders, late warnings.

Automatic reminders at 7 days, 3 days, 1 day, due today, and late.

Global search (student, assignment, subject, teacher, date) and filters (pending, submitted, late, completed, marks high/low, newest/oldest).

Phase 4 — Projects and admin

Projects with multiple tasks, milestones, deadlines, and progress %.

Admin panel: manage teachers, students, classes, subjects; platform-wide analytics.

OCR preview for teachers ("Convert to Digital") on handwritten uploads.

Technical notes

Stack stays TanStack Start (React + TypeScript + Vite), Tailwind, Framer Motion, Recharts, KaTeX. Next.js is not used; TanStack Router is the routing layer.

Lovable Cloud provides Postgres, auth, and file storage. Tables: profiles, user_roles, classes, class_members, subjects, assignments, assignment_attachments, submissions, submission_files, annotations, grades, comments, notifications, projects, project_tasks, paste_violations.

Row-level security on every table: students read only their own submissions and their classes' assignments; teachers read only their own classes; admin access via a security-definer role check.

Uploads go to private storage buckets with signed URLs; no public file access.

Reminders run on a scheduled job hitting a secured server endpoint.

AI features (OCR, plagiarism, grading assistance, handwriting feedback, deadline prediction, study recommendations) are not built now, but the schema and service layer leave hooks for them.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b9fd240f-b44f-4b12-80ff-75d8788f7a22).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
