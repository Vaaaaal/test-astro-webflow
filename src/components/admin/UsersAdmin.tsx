import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ROLES, canManageUserWithRole, type Role } from "@/config/roles";

// super_admin is a break-glass mechanism granted only via SUPER_ADMIN_EMAILS —
// it must never be shown or selectable through this UI.
const SELECTABLE_ROLES = ROLES.filter((r) => r !== "super_admin");
import type { UserEntry } from "@/lib/usersStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddUserDialog } from "./AddUserDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { STICKY_ACTIONS_CELL_CLASS, STICKY_ACTIONS_HEAD_CLASS } from "@/lib/utils";

interface UsersAdminProps {
  base: string;
  currentUserEmail: string;
  currentUserRole: Role;
}

export default function UsersAdmin({ base, currentUserEmail, currentUserRole }: UsersAdminProps) {
  const [users, setUsers] = useState<UserEntry[] | null>(null);
  const [bootstrapSuperAdmins, setBootstrapSuperAdmins] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UserEntry | null>(null);

  function loadUsers() {
    setError(null);
    fetch(`${base}/api/users`)
      .then((res) => {
        if (!res.ok) throw new Error(`GET /api/users failed: ${res.status}`);
        return res.json() as Promise<{ users: UserEntry[]; bootstrapSuperAdmins: string[] }>;
      })
      .then((data) => {
        setUsers(data.users);
        setBootstrapSuperAdmins(data.bootstrapSuperAdmins);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        toast.error("Impossible de charger les utilisateurs", { description: message });
      });
  }

  useEffect(loadUsers, [base]);

  async function handleRoleChange(user: UserEntry, nextRole: Role) {
    const previous = users;
    setUsers((prev) => prev?.map((u) => (u.email === user.email ? { ...u, role: nextRole } : u)) ?? prev);
    try {
      const res = await fetch(`${base}/api/users/${encodeURIComponent(user.email)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = (await res.json()) as { error?: string; entry?: UserEntry };
      if (!res.ok) throw new Error(data?.error ?? `Échec (${res.status})`);
    } catch (err) {
      setUsers(previous); // revert on failure
      toast.error("Échec du changement de rôle", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleDelete(user: UserEntry) {
    const previous = users;
    setUsers((prev) => prev?.filter((u) => u.email !== user.email) ?? prev);
    try {
      const res = await fetch(`${base}/api/users/${encodeURIComponent(user.email)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Échec (${res.status})`);
      toast.success(`Accès de ${user.email} supprimé`);
    } catch (err) {
      setUsers(previous); // revert on failure
      toast.error("Échec de la suppression", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handleCreated(entry: UserEntry) {
    setUsers((prev) => (prev ? [...prev, entry] : [entry]));
    toast.success(`${entry.email} ajouté`);
  }

  if (error && users === null) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        <span>Impossible de charger les utilisateurs.</span>
        <Button variant="outline" size="sm" onClick={loadUsers}>
          Réessayer
        </Button>
      </div>
    );
  }

  if (users === null) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Comptes ({users.length})</h2>
        <AddUserDialog base={base} currentUserRole={currentUserRole} onCreated={handleCreated} />
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun utilisateur pour l'instant.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Ajouté par</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead className={STICKY_ACTIONS_HEAD_CLASS}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const canManage = canManageUserWithRole(currentUserRole, user.role);
                const isSelf = user.email === currentUserEmail;
                return (
                  <TableRow key={user.email}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        disabled={!canManage || isSelf}
                        onValueChange={(v) => handleRoleChange(user, v as Role)}
                      >
                        <SelectTrigger
                          className="w-36"
                          title={
                            isSelf
                              ? "Vous ne pouvez pas modifier votre propre rôle"
                              : !canManage
                                ? "Vous ne pouvez pas gérer ce rôle"
                                : undefined
                          }
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SELECTABLE_ROLES.filter(
                            (r) => canManageUserWithRole(currentUserRole, r) || r === user.role
                          ).map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.addedBy}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className={STICKY_ACTIONS_CELL_CLASS}>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canManage || isSelf}
                        title={
                          isSelf
                            ? "Vous ne pouvez pas supprimer votre propre compte"
                            : !canManage
                              ? "Vous ne pouvez pas gérer ce compte"
                              : undefined
                        }
                        onClick={() => setPendingDelete(user)}
                      >
                        Supprimer
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {bootstrapSuperAdmins.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Accès de secours</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Accordé via la variable d'environnement SUPER_ADMIN_EMAILS, non modifiable ici.
          </p>
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            {bootstrapSuperAdmins.map((email) => (
              <div key={email} className="flex items-center justify-between text-sm">
                <span>{email}</span>
                <Badge variant="outline">super_admin · bootstrap</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Supprimer l'accès"
        description={
          pendingDelete ? `Supprimer l'accès de ${pendingDelete.email} ?` : ""
        }
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (pendingDelete) handleDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
