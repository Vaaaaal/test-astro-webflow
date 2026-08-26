import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { PageEntry } from "@/lib/pagesStore";
import type { LocaleInfo } from "@/lib/localesStore";
import { getCategoryAdminLabel, type CategoryEntry } from "@/lib/categoriesStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditPageDialog } from "./EditPageDialog";

interface PagesAdminProps {
  base: string;
}

export default function PagesAdmin({ base }: PagesAdminProps) {
  const [pages, setPages] = useState<PageEntry[] | null>(null);
  const [locales, setLocales] = useState<LocaleInfo[]>([]);
  const [categories, setCategories] = useState<CategoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchPending, setBatchPending] = useState(false);
  const [categorySelectKey, setCategorySelectKey] = useState(0);

  function loadPages() {
    setError(null);
    Promise.all([
      fetch(`${base}/api/pages`).then((res) => {
        if (!res.ok) throw new Error(`GET /api/pages failed: ${res.status}`);
        return res.json() as Promise<PageEntry[]>;
      }),
      fetch(`${base}/api/locales`).then((res) => {
        if (!res.ok) throw new Error(`GET /api/locales failed: ${res.status}`);
        return res.json() as Promise<LocaleInfo[]>;
      }),
      fetch(`${base}/api/categories`).then((res) => {
        if (!res.ok) throw new Error(`GET /api/categories failed: ${res.status}`);
        return res.json() as Promise<CategoryEntry[]>;
      }),
    ])
      .then(([pagesData, localesData, categoriesData]) => {
        setPages(pagesData);
        setLocales(localesData);
        setCategories(categoriesData);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        toast.error("Impossible de charger les pages", { description: message });
      });
  }

  useEffect(loadPages, [base]);

  const primaryLocale = locales.find((l) => l.isPrimary) ?? locales[0];

  function handleSaved(updated: PageEntry) {
    setPages((prev) => prev?.map((p) => (p.id === updated.id ? updated : p)) ?? prev);
  }

  async function handleToggleVisible(page: PageEntry, next: boolean) {
    handleSaved({ ...page, visibleInSearch: next }); // optimistic
    try {
      const res = await fetch(`${base}/api/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibleInSearch: next }),
      });
      const data = (await res.json()) as { error?: string; entry?: PageEntry };
      if (!res.ok) throw new Error(data?.error ?? `Échec (${res.status})`);
      handleSaved(data.entry as PageEntry);
    } catch (err) {
      handleSaved(page); // revert on failure
      toast.error("Échec de la mise à jour de la visibilité", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleBatchUpdate(patch: { category?: string | null; visibleInSearch?: boolean }) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBatchPending(true);
    try {
      const res = await fetch(`${base}/api/pages/batch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, patch }),
      });
      const data = (await res.json()) as { error?: string; updated?: PageEntry[] };
      if (!res.ok) throw new Error(data?.error ?? `Échec (${res.status})`);
      const updatedById = new Map((data.updated ?? []).map((p) => [p.id, p]));
      setPages((prev) => prev?.map((p) => updatedById.get(p.id) ?? p) ?? prev);
      setCategorySelectKey((k) => k + 1);
      toast.success(`${ids.length} page${ids.length > 1 ? "s" : ""} mise${ids.length > 1 ? "s" : ""} à jour`);
    } catch (err) {
      toast.error("Échec de la mise à jour groupée", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBatchPending(false);
    }
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  if (error && pages === null) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        <span>Impossible de charger les pages.</span>
        <Button variant="outline" size="sm" onClick={loadPages}>
          Réessayer
        </Button>
      </div>
    );
  }

  if (pages === null) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  if (pages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune page pour l'instant. Les pages apparaissent ici automatiquement après une
        publication Webflow.
      </p>
    );
  }

  const editingEntry = pages.find((p) => p.id === editingId) ?? null;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredPages = normalizedQuery
    ? pages.filter((page) => {
        const content = primaryLocale ? page.locales[primaryLocale.id] : undefined;
        const haystack = [content?.publishedPath, content?.title, content?.webflowTitle]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : pages;

  const filteredIds = filteredPages.map((p) => p.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someFilteredSelected = filteredIds.some((id) => selectedIds.has(id));

  function toggleSelectAllFiltered(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of filteredIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Rechercher par chemin ou par titre…"
        className="max-w-sm"
      />

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">
            {selectedIds.size} page{selectedIds.size > 1 ? "s" : ""} sélectionnée
            {selectedIds.size > 1 ? "s" : ""}
          </span>
          <Select
            key={categorySelectKey}
            disabled={batchPending}
            onValueChange={(value) =>
              handleBatchUpdate({ category: value === "__none__" ? null : value })
            }
          >
            <SelectTrigger className="h-8 w-56">
              <SelectValue placeholder="Assigner une catégorie…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Aucune catégorie</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.adminLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={batchPending}
            onClick={() => handleBatchUpdate({ visibleInSearch: true })}
          >
            Afficher
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={batchPending}
            onClick={() => handleBatchUpdate({ visibleInSearch: false })}
          >
            Masquer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={batchPending}
            onClick={() => setSelectedIds(new Set())}
          >
            Effacer la sélection
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => toggleSelectAllFiltered(checked === true)}
                aria-label="Sélectionner toutes les pages affichées"
              />
            </TableHead>
            <TableHead>Page</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Titre</TableHead>
            <TableHead>Catégorie</TableHead>
            <TableHead>Dernière publication</TableHead>
            <TableHead>Visible</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredPages.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                Aucune page ne correspond à "{searchQuery}".
              </TableCell>
            </TableRow>
          )}
          {filteredPages.map((page) => {
            const content = primaryLocale ? page.locales[primaryLocale.id] : undefined;
            return (
              <TableRow key={page.id} className={page.visibleInSearch ? undefined : "opacity-60"}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(page.id)}
                    onCheckedChange={(checked) => toggleSelected(page.id, checked === true)}
                    aria-label={`Sélectionner ${content?.publishedPath ?? "cette page"}`}
                  />
                </TableCell>
                <TableCell className="max-w-64 truncate font-medium">{content?.publishedPath ?? ""}</TableCell>
                <TableCell>
                  <Badge variant={page.kind === "cms" ? "default" : "outline"}>
                    {page.kind === "cms" ? "CMS" : "Page"}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-64 truncate">
                  {content?.title ?? (
                    <span className="text-muted-foreground">{content?.webflowTitle || "—"}</span>
                  )}
                </TableCell>
                <TableCell>
                  {page.category ? (
                    <Badge variant="secondary">{getCategoryAdminLabel(categories, page.category)}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(page.lastPublishedAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={page.visibleInSearch}
                    onCheckedChange={(checked) => handleToggleVisible(page, checked)}
                    aria-label={
                      page.visibleInSearch
                        ? "Masquer cette page des résultats de recherche"
                        : "Afficher cette page dans les résultats de recherche"
                    }
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => setEditingId(page.id)}>
                    Modifier
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>

      <EditPageDialog
        entry={editingEntry}
        locales={locales}
        categories={categories}
        base={base}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
        onSaved={handleSaved}
      />
    </div>
  );
}
