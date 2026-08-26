import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CategoryEntry } from "@/lib/categoriesStore";
import type { PageEntry } from "@/lib/pagesStore";
import type { LocaleInfo } from "@/lib/localesStore";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryDialog } from "./CategoryDialog";

interface CategoriesAdminProps {
  base: string;
}

export default function CategoriesAdmin({ base }: CategoriesAdminProps) {
  const [categories, setCategories] = useState<CategoryEntry[] | null>(null);
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [locales, setLocales] = useState<LocaleInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    Promise.all([
      fetch(`${base}/api/categories`).then((res) => {
        if (!res.ok) throw new Error(`GET /api/categories failed: ${res.status}`);
        return res.json() as Promise<CategoryEntry[]>;
      }),
      fetch(`${base}/api/pages`).then((res) => {
        if (!res.ok) throw new Error(`GET /api/pages failed: ${res.status}`);
        return res.json() as Promise<PageEntry[]>;
      }),
      fetch(`${base}/api/locales`).then((res) => {
        if (!res.ok) throw new Error(`GET /api/locales failed: ${res.status}`);
        return res.json() as Promise<LocaleInfo[]>;
      }),
    ])
      .then(([categoriesData, pagesData, localesData]) => {
        setCategories(categoriesData);
        setPages(pagesData);
        setLocales(localesData);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        toast.error("Impossible de charger les catégories", { description: message });
      });
  }

  useEffect(load, [base]);

  function handleSaved(entry: CategoryEntry) {
    setCategories((prev) => {
      if (!prev) return [entry];
      const exists = prev.some((c) => c.key === entry.key);
      return exists ? prev.map((c) => (c.key === entry.key ? entry : c)) : [...prev, entry];
    });
  }

  async function handleDelete(entry: CategoryEntry) {
    const usageCount = pages.filter((p) => p.category === entry.key).length;
    const confirmMessage =
      usageCount > 0
        ? `Supprimer "${entry.adminLabel}" ? ${usageCount} page(s) l'utilisent actuellement et repasseront à "aucune catégorie".`
        : `Supprimer "${entry.adminLabel}" ?`;
    if (!window.confirm(confirmMessage)) return;

    const previous = categories;
    setCategories((prev) => prev?.filter((c) => c.key !== entry.key) ?? prev);
    try {
      const res = await fetch(`${base}/api/categories/${encodeURIComponent(entry.key)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Échec (${res.status})`);
      toast.success(`"${entry.adminLabel}" supprimée`);
      load(); // refresh page counts too
    } catch (err) {
      setCategories(previous); // revert on failure
      toast.error("Échec de la suppression", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (error && categories === null) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        <span>Impossible de charger les catégories.</span>
        <Button variant="outline" size="sm" onClick={load}>
          Réessayer
        </Button>
      </div>
    );
  }

  if (categories === null) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Catégories ({categories.length})</h2>
        <CategoryDialog base={base} locales={locales} onSaved={handleSaved} />
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune catégorie pour l'instant.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clé</TableHead>
                <TableHead>Libellé admin</TableHead>
                <TableHead>Préfixe par défaut</TableHead>
                <TableHead>Pages</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.key}>
                  <TableCell className="font-mono text-sm">{category.key}</TableCell>
                  <TableCell className="font-medium">{category.adminLabel}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {category.prefixes["*"] || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {pages.filter((p) => p.category === category.key).length}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <CategoryDialog base={base} entry={category} locales={locales} onSaved={handleSaved} />
                      <Button variant="outline" size="sm" onClick={() => handleDelete(category)}>
                        Supprimer
                      </Button>
                    </div>
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
