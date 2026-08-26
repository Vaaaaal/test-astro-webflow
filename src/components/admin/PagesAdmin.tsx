import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { PageEntry } from "@/lib/pagesStore";
import type { LocaleInfo } from "@/lib/localesStore";
import { getCategoryAdminLabel, type CategoryEntry } from "@/lib/categoriesStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Rechercher par chemin ou par titre…"
        className="max-w-sm"
      />
      <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
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
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                Aucune page ne correspond à "{searchQuery}".
              </TableCell>
            </TableRow>
          )}
          {filteredPages.map((page) => {
            const content = primaryLocale ? page.locales[primaryLocale.id] : undefined;
            return (
              <TableRow key={page.id} className={page.visibleInSearch ? undefined : "opacity-60"}>
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
