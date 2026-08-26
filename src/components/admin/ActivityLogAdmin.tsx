import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ActivityEntry } from "@/lib/activityLogStore";
import type { UserEntry } from "@/lib/usersStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

interface ActivityLogAdminProps {
  base: string;
}

const ACTION_LABELS: Record<string, string> = {
  "page.updated": "Page modifiée",
  "pages.batch_updated": "Pages modifiées en masse",
  "category.created": "Catégorie créée",
  "category.updated": "Catégorie modifiée",
  "category.deleted": "Catégorie supprimée",
  "cms_collection.configured": "Collection CMS configurée",
  "cms_collection.updated": "Collection CMS modifiée",
  "cms_collection.removed": "Collection CMS retirée",
  "user.invited": "Utilisateur ajouté",
  "user.role_changed": "Rôle modifié",
  "user.access_removed": "Accès supprimé",
};

function formatDetails(entry: ActivityEntry): string {
  const d = entry.details;
  if (!d) return "—";
  switch (entry.action) {
    case "page.updated":
      return Array.isArray(d.fields) && d.fields.length > 0 ? d.fields.join(", ") : "—";
    case "pages.batch_updated":
      return JSON.stringify(d.patch ?? {});
    case "category.deleted":
      return typeof d.clearedPages === "number" && d.clearedPages > 0
        ? `${d.clearedPages} page(s) repassées à "aucune catégorie"`
        : "—";
    case "user.invited":
      return typeof d.role === "string" ? `Rôle : ${d.role}` : "—";
    case "user.role_changed":
      return `${d.from} → ${d.to}`;
    default:
      return "—";
  }
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function ActivityLogAdmin({ base }: ActivityLogAdminProps) {
  const [month, setMonth] = useState(currentMonth());
  const [actor, setActor] = useState<string>("__all__");
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [bootstrapSuperAdmins, setBootstrapSuperAdmins] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${base}/api/users`)
      .then((res) => res.json() as Promise<{ users: UserEntry[]; bootstrapSuperAdmins: string[] }>)
      .then((data) => {
        setUsers(data.users);
        setBootstrapSuperAdmins(data.bootstrapSuperAdmins);
      })
      .catch(() => {
        // Non-fatal: the actor filter just stays empty, the log itself still loads.
      });
  }, [base]);

  function load() {
    setError(null);
    const params = new URLSearchParams({ month });
    if (actor !== "__all__") params.set("actor", actor);
    fetch(`${base}/api/activity?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`GET /api/activity failed: ${res.status}`);
        return res.json() as Promise<{ month: string; entries: ActivityEntry[] }>;
      })
      .then((data) => setEntries(data.entries))
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        toast.error("Impossible de charger le journal d'activité", { description: message });
      });
  }

  useEffect(load, [base, month, actor]);

  const knownActors = [...new Set([...users.map((u) => u.email), ...bootstrapSuperAdmins])];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            <ChevronLeftIcon />
          </Button>
          <span className="w-36 text-center text-sm capitalize">{formatMonthLabel(month)}</span>
          <Button
            variant="outline"
            size="icon"
            disabled={month >= currentMonth()}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            <ChevronRightIcon />
          </Button>
        </div>
        <Select value={actor} onValueChange={setActor}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Tous les utilisateurs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tous les utilisateurs</SelectItem>
            {knownActors.map((email) => (
              <SelectItem key={email} value={email}>
                {email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && entries === null ? (
        <div className="flex items-center justify-between rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <span>Impossible de charger le journal d'activité.</span>
          <Button variant="outline" size="sm" onClick={load}>
            Réessayer
          </Button>
        </div>
      ) : entries === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune activité pour cette période.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Cible</TableHead>
                <TableHead>Détails</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">{entry.actorEmail}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ACTION_LABELS[entry.action] ?? entry.action}</Badge>
                  </TableCell>
                  <TableCell className="max-w-64 truncate">{entry.targetLabel}</TableCell>
                  <TableCell className="max-w-80 truncate text-muted-foreground">
                    {formatDetails(entry)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
