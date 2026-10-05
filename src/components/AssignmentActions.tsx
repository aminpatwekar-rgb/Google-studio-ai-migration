import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";
import { updateAssignment, createAssignment, deleteAssignment } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AssignmentDialog, type AssignmentDraft } from "@/components/AssignmentDialog";

export type AssignmentRow = AssignmentDraft & {
  archived: boolean;
  id: string;
  class_id: string;
  title: string;
};

export function AssignmentActions({
  assignment,
  teacherId,
  onViewSubmissions,
  afterDelete,
}: {
  assignment: AssignmentRow;
  teacherId: string;
  onViewSubmissions?: () => void;
  afterDelete?: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["class-assignments"] });
    void qc.invalidateQueries({ queryKey: ["assignment"] });
    void qc.invalidateQueries({ queryKey: ["all-assignments"] });
    void qc.invalidateQueries({ queryKey: ["teacher-dash"] });
    void qc.invalidateQueries({ queryKey: ["student-dash"] });
  }

  const patch = useMutation({
    mutationFn: async (values: { published?: boolean; archived?: boolean }) => {
      await updateAssignment(assignment.id, values as any);
    },
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async () => {
      const id = await createAssignment({
        classId: assignment.class_id,
        title: `${assignment.title} (copy)`.slice(0, 160),
        description: assignment.instructions || "",
        dueDate: assignment.due_date || new Date().toISOString(),
        maxPoints: Number(assignment.max_marks) || 100,
        createdBy: teacherId,
        createdAt: new Date().toISOString(),
      });
      return id;
    },
    onSuccess: (id) => {
      toast.success("Duplicated as a draft");
      refresh();
      void navigate({ to: "/assignments/$assignmentId", params: { assignmentId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await deleteAssignment(assignment.id);
    },
    onSuccess: () => {
      toast.success("Assignment deleted");
      setConfirmDelete(false);
      refresh();
      if (afterDelete) afterDelete();
      else void navigate({ to: "/classes/$classId", params: { classId: assignment.class_id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = patch.isPending || duplicate.isPending || remove.isPending;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Assignment actions" disabled={busy}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="mr-2 size-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => duplicate.mutate()}>
            <Copy className="mr-2 size-4" /> Duplicate
          </DropdownMenuItem>
          {onViewSubmissions && (
            <DropdownMenuItem onSelect={() => onViewSubmissions()}>
              <Users className="mr-2 size-4" /> View submissions
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              patch.mutate(
                { published: !assignment.published },
                {
                  onSuccess: () =>
                    toast.success(assignment.published ? "Unpublished" : "Published"),
                },
              );
            }}
          >
            {assignment.published ? (
              <>
                <EyeOff className="mr-2 size-4" /> Unpublish
              </>
            ) : (
              <>
                <Eye className="mr-2 size-4" /> Publish
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              patch.mutate(
                { archived: !assignment.archived },
                {
                  onSuccess: () => toast.success(assignment.archived ? "Restored" : "Archived"),
                },
              );
            }}
          >
            {assignment.archived ? (
              <>
                <ArchiveRestore className="mr-2 size-4" /> Restore
              </>
            ) : (
              <>
                <Archive className="mr-2 size-4" /> Archive
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setConfirmDelete(true)}
          >
            <Trash2 className="mr-2 size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AssignmentDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        classId={assignment.class_id}
        teacherId={teacherId}
        assignment={assignment}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{assignment.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the assignment and every submission attached to it. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
              disabled={remove.isPending}
            >
              Delete assignment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
