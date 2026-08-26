import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CmsCollectionEntry } from "@/lib/cmsCollectionsStore";
import type { CategoryEntry } from "@/lib/categoriesStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CmsCollectionDialog } from "./CmsCollectionDialog";

interface CmsCollectionsAdminProps {
  base: string;
}

interface WebflowCollectionWithFields {
  id: string;
  displayName: string;
  slug: string;
  fields: { slug: string; displayName: string }[];
  basePath: string | null;
}

export default function CmsCollectionsAdmin({ base }: CmsCollectionsAdminProps) {
  const [webflowCollections, setWebflowCollections] = useState<WebflowCollectionWithFields[] | null>(
    null
  );
  const [configured, setConfigured] = useState<CmsCollectionEntry[]>([]);
  const [categories, setCategories] = useState<CategoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    Promise.all([
      fetch(`${base}/api/webflow-collections`).then((res) => {
        if (!res.ok) throw new Error(`GET /api/webflow-collections failed: ${res.status}`);
        return res.json() as Promise<WebflowCollectionWithFields[]>;
      }),
      fetch(`${base}/api/cms-collections`).then((res) => {
        if (!res.ok) throw new Error(`GET /api/cms-collections failed: ${res.status}`);
        return res.json() as Promise<CmsCollectionEntry[]>;
      }),
      fetch(`${base}/api/categories`).then((res) => {
        if (!res.ok) throw new Error(`GET /api/categories failed: ${res.status}`);
        return res.json() as Promise<CategoryEntry[]>;
      }),
    ])
      .then(([webflowData, configuredData, categoriesData]) => {
        setWebflowCollections(webflowData);
        setConfigured(configuredData);
        setCategories(categoriesData);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        toast.error("Impossible de charger les collections", { description: message });
      });
  }

  useEffect(load, [base]);

  function handleSaved(entry: CmsCollectionEntry) {
    setConfigured((prev) => {
      const exists = prev.some((c) => c.collectionId === entry.collectionId);
      return exists
        ? prev.map((c) => (c.collectionId === entry.collectionId ? entry : c))
        : [...prev, entry];
    });
  }

  async function handleRemove(collectionId: string, displayName: string) {
    if (!window.confirm(`Retirer "${displayName}" de la synchronisation ?`)) return;
    const previous = configured;
    setConfigured((prev) => prev.filter((c) => c.collectionId !== collectionId));
    try {
      const res = await fetch(`${base}/api/cms-collections/${encodeURIComponent(collectionId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Échec (${res.status})`);
      toast.success(`"${displayName}" retirée`);
    } catch (err) {
      setConfigured(previous); // revert on failure
      toast.error("Échec du retrait", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (error && webflowCollections === null) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        <span>Impossible de charger les collections.</span>
        <Button variant="outline" size="sm" onClick={load}>
          Réessayer
        </Button>
      </div>
    );
  }

  if (webflowCollections === null) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  if (webflowCollections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune collection CMS trouvée sur ce site Webflow.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Collection</TableHead>
            <TableHead>Chemin de base</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Champ résumé</TableHead>
            <TableHead>Catégorie par défaut</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {webflowCollections.map((wc) => {
            const entry = configured.find((c) => c.collectionId === wc.id);
            const category = entry?.defaultCategory
              ? categories.find((c) => c.key === entry.defaultCategory)
              : undefined;
            return (
              <TableRow key={wc.id}>
                <TableCell className="font-medium">{wc.displayName}</TableCell>
                <TableCell className="text-muted-foreground">
                  {wc.basePath ?? <span className="italic">non publiée</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={entry ? "default" : "outline"}>
                    {entry ? "Synchronisée" : "Non configurée"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {entry?.summaryField
                    ? wc.fields.find((f) => f.slug === entry.summaryField)?.displayName ??
                      entry.summaryField
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{category?.adminLabel ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <CmsCollectionDialog
                      base={base}
                      webflowCollection={wc}
                      entry={entry}
                      categories={categories}
                      onSaved={handleSaved}
                    />
                    {entry && (
                      <Button variant="outline" size="sm" onClick={() => handleRemove(wc.id, wc.displayName)}>
                        Retirer
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
