import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building, IdCard, Loader2, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { updateUserProfile } from "@/lib/firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function ProfileSettingsCard() {
  const { user, profile, role, refresh } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [institution, setInstitution] = useState(profile?.institution ?? "");
  const [rollNo, setRollNo] = useState(profile?.roll_no ?? "");
  const [erNo, setErNo] = useState(profile?.er_no ?? "");
  const [srNo, setSrNo] = useState(profile?.sr_no ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? profile.name ?? "");
    setInstitution(profile.institution ?? "");
    setRollNo(profile.roll_no ?? "");
    setErNo(profile.er_no ?? "");
    setSrNo(profile.sr_no ?? "");
  }, [profile]);

  const initials = (profile?.full_name || profile?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isTeacherOrAdmin = role === "teacher" || role === "admin";
  const isStudent = role === "student";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast.error("Full name cannot be empty");
      return;
    }

    if (isStudent && !rollNo.trim() && !erNo.trim() && !srNo.trim()) {
      toast.error("Enter at least one of Roll No., ER No., or Sr No.");
      return;
    }

    setSaving(true);
    try {
      await updateUserProfile(user.id, {
        name: trimmedName,
        rollNo: rollNo.trim() || undefined,
        institution: isTeacherOrAdmin && institution.trim() ? institution.trim() : undefined,
      });

      await refresh();
      toast.success(isStudent ? "Profile & academic IDs updated" : "Profile updated successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="lift transition-colors duration-200 hover:lift-hover">
      <CardHeader>
        <CardTitle>Profile Details</CardTitle>
        <CardDescription>
          {isStudent
            ? "Manage your name and academic identifiers. Changes update your class rosters too."
            : "Update your display name and academic affiliation."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="size-16 border border-border/60">
              <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {profile?.full_name || "Account Profile"}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {role ?? "User"} · Avatar generated from initials
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="full_name" className="text-sm font-medium">
                Full Name
              </Label>
              <div className="relative">
                <Input
                  id="full_name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  required
                  disabled={saving}
                  className="pl-9"
                />
                <User className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              </div>
            </div>

            {isTeacherOrAdmin && (
              <div className="space-y-2">
                <Label htmlFor="institution" className="text-sm font-medium">
                  Institution / Department
                </Label>
                <div className="relative">
                  <Input
                    id="institution"
                    type="text"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    placeholder="e.g. Department of Computer Science"
                    disabled={saving}
                    className="pl-9"
                  />
                  <Building className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {isStudent && (
            <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <IdCard className="size-4 text-primary" />
                  <p className="text-sm font-semibold">Academic Identifiers</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  These are reused when you join a class and are shown to teachers in the class
                  roster.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="profile-roll">Roll No.</Label>
                  <Input
                    id="profile-roll"
                    maxLength={40}
                    value={rollNo}
                    onChange={(e) => setRollNo(e.target.value)}
                    placeholder="e.g. 23"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-er">ER No.</Label>
                  <Input
                    id="profile-er"
                    maxLength={40}
                    value={erNo}
                    onChange={(e) => setErNo(e.target.value)}
                    placeholder="e.g. ER12345"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-sr">Sr No.</Label>
                  <Input
                    id="profile-sr"
                    maxLength={40}
                    value={srNo}
                    onChange={(e) => setSrNo(e.target.value)}
                    placeholder="e.g. 15"
                    disabled={saving}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                At least one identifier is required for students. You can leave the other fields
                blank.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Saving changes..." : "Save Profile"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
