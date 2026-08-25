import { useState } from "react";
import { toast } from "sonner";
import { assignableRoles, type Role } from "@/config/roles";
import type { UserEntry } from "@/lib/usersStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AddUserDialogProps {
  base: string;
  currentUserRole: Role;
  onCreated: (entry: UserEntry) => void;
}

type SaveState = "idle" | "saving";

export function AddUserDialog({ base, currentUserRole, onCreated }: AddUserDialogProps) {
  // super_admin is a break-glass mechanism granted only via SUPER_ADMIN_EMAILS
  // — it must never be shown or selectable here, even for a super_admin actor.
  const availableRoles = assignableRoles(currentUserRole).filter((r) => r !== "super_admin");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  function reset() {
    setEmail("");
    setRole("");
    setSaveState("idle");
  }

  async function handleSave() {
    if (!role) return;
    setSaveState("saving");
    try {
      const res = await fetch(`${base}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = (await res.json()) as { error?: string; entry?: UserEntry };
      if (!res.ok) {
        throw new Error(data?.error ?? `Échec (${res.status})`);
      }
      onCreated(data.entry as UserEntry);
      setOpen(false);
      reset();
    } catch (err) {
      setSaveState("idle");
      toast.error("Échec de l'ajout", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>Ajouter un utilisateur</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un utilisateur</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="new-user-email">Email</Label>
            <Input
              id="new-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-user-role">Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="new-user-role" className="w-full">
                <SelectValue placeholder="— choisir —" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={!email || !role || saveState === "saving"}>
            {saveState === "saving" ? "Ajout…" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
