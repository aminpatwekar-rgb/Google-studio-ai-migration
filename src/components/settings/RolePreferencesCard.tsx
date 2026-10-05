import { useState } from "react";
import { toast } from "sonner";
import { Sliders, BookOpen, GraduationCap, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function RolePreferencesCard() {
  const { role } = useAuth();
  const { effectiveRole } = useViewRole();

  // NOTE: Persistence uses local state because there is no dedicated
  // 'user_preferences' table or column on profiles for custom study/grading defaults.
  // When a user_preferences table is provisioned, save these defaults to Supabase.

  // Student states
  const [reminderLeadTime, setReminderLeadTime] = useState("1_day");
  const [dailyStudyGoal, setDailyStudyGoal] = useState("45");

  // Teacher / Admin states
  const [defaultMaxMarks, setDefaultMaxMarks] = useState("100");
  const [autoLatePenalty, setAutoLatePenalty] = useState(false);
  const [defaultSubmissionFormat, setDefaultSubmissionFormat] = useState("any");

  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Defaults saved for this session");
  };

  if (!isTeacher) {
    return (
      <Card className="lift transition-colors duration-200 hover:lift-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            Preferences & Defaults
          </CardTitle>
          <CardDescription>
            Personalize your study schedule and deadline notification lead times.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSavePreferences} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lead-time" className="text-sm font-medium">
                  Default Reminder Lead Time
                </Label>
                <Select value={reminderLeadTime} onValueChange={setReminderLeadTime}>
                  <SelectTrigger id="lead-time">
                    <SelectValue placeholder="Select reminder lead time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1_day">1 day before deadline</SelectItem>
                    <SelectItem value="3_days">3 days before deadline</SelectItem>
                    <SelectItem value="1_week">1 week before deadline</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  When you will be prompted to begin high-priority assignments.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="study-goal" className="text-sm font-medium">
                  Daily Study Target (minutes)
                </Label>
                <Input
                  id="study-goal"
                  type="number"
                  min="15"
                  max="480"
                  step="15"
                  value={dailyStudyGoal}
                  onChange={(e) => setDailyStudyGoal(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Target daily study time highlighted on your dashboard.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" variant="secondary" size="sm">
                Apply Study Preferences
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lift transition-colors duration-200 hover:lift-hover">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="size-5 text-primary" />
          Preferences & Defaults
        </CardTitle>
        <CardDescription>
          Set default parameters to pre-fill when drafting new assignments and quizzes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSavePreferences} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="default-max-marks" className="text-sm font-medium">
                Default Maximum Points / Marks
              </Label>
              <Input
                id="default-max-marks"
                type="number"
                min="1"
                max="1000"
                value={defaultMaxMarks}
                onChange={(e) => setDefaultMaxMarks(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Initial point value suggested when creating new assignments.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="default-format" className="text-sm font-medium">
                Preferred Submission Format
              </Label>
              <Select value={defaultSubmissionFormat} onValueChange={setDefaultSubmissionFormat}>
                <SelectTrigger id="default-format">
                  <SelectValue placeholder="Select submission format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any (Text & File Upload)</SelectItem>
                  <SelectItem value="file_only">File Attachment Only (PDF, DOCX)</SelectItem>
                  <SelectItem value="text_only">Rich Text & Typed Editor Only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Default submission mode for newly created assignments.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/70 p-3.5 transition-colors hover:bg-muted/40">
            <div className="space-y-0.5 pr-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-muted-foreground" />
                <Label htmlFor="late-penalty-toggle" className="text-sm font-medium cursor-pointer">
                  Default Late Penalty Suggestion
                </Label>
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                Automatically pre-enable late submission warnings on new assignment forms.
              </p>
            </div>
            <Switch
              id="late-penalty-toggle"
              checked={autoLatePenalty}
              onCheckedChange={setAutoLatePenalty}
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" variant="secondary" size="sm">
              Save Grading Defaults
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
