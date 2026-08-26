import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CmsCollectionEntry } from "@/lib/cmsCollectionsStore";
import type { CategoryEntry } from "@/lib/categoriesStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResetButton } from "./ResetButton";

interface WebflowCollectionWithFields {
  id: string;
  displayName: string;
  slug: string;
  fields: { slug: string; displayName: string }[];
  basePath: string | null;
}

interface CmsCollectionDialogProps {
  base: string;
  webflowCollection: WebflowCollectionWithFields;
  entry?: CmsCollectionEntry; // omit to configure a not-yet-tracked collection
  categories: CategoryEntry[];
  onSaved: (entry: CmsCollectionEntry) => void;
}

export function CmsCollectionDialog({
  base,
  webflowCollection,
  entry,
  categories,
  onSaved,
}: CmsCollectionDialogProps) {
  const isEdit = entry !== undefined;
  const [open, setOpen] = useState(false);
  const [summaryField, setSummaryField] = useState(entry?.summaryField ?? "");
  const [defaultCategory, setDefaultCategory] = useState(entry?.defaultCategory ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSummaryField(entry?.summaryField ?? "");
    setDefaultCategory(entry?.defaultCategory ?? "");
  }, [open, entry]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(
        isEdit
          ? `${base}/api/cms-collections/${encodeURIComponent(webflowCollection.id)}`
          : `${base}/api/cms-collections`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isEdit ? {} : { collectionId: webflowCollection.id }),
            summaryField: summaryField || null,
            defaultCategory: defaultCategory || null,
          }),
        }
      );
      const data = (await res.json()) as { error?: string; entry?: CmsCollectionEntry };
      if (!res.ok) throw new Error(data?.error ?? `Échec (${res.status})`);
      onSaved(data.entry as CmsCollectionEntry);
      toast.success(isEdit ? "Collection mise à jour" : "Collection configurée");
      setOpen(false);
    } catch (err) {
      toast.error(isEdit ? "Échec de la mise à jour" : "Échec de la configuration", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isEdit ? "outline" : "default"} size="sm">
          {isEdit ? "Modifier" : "Configurer"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{webflowCollection.displayName}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-0.5 text-left">
              <p>
                Chemin de base détecté :{" "}
                {webflowCollection.basePath ?? "aucun (page de collection pas encore publiée)"}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="cms-summary-field">Champ résumé (optionnel)</Label>
              <ResetButton onClick={() => setSummaryField("")} />
            </div>
            <Select value={summaryField} onValueChange={setSummaryField}>
              <SelectTrigger id="cms-summary-field" className="w-full">
                <SelectValue placeholder="— aucun —" />
              </SelectTrigger>
              <SelectContent>
                {webflowCollection.fields.map((f) => (
                  <SelectItem key={f.slug} value={f.slug}>
                    {f.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Les items CMS n'ont pas de méta-description standardisée — choisis le champ à utiliser
              comme résumé de recherche.
            </p>
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="cms-default-category">Catégorie par défaut (optionnel)</Label>
              <ResetButton onClick={() => setDefaultCategory("")} />
            </div>
            <Select value={defaultCategory} onValueChange={setDefaultCategory}>
              <SelectTrigger id="cms-default-category" className="w-full">
                <SelectValue placeholder="— aucune —" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.adminLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Assignée à la création d'un item — toujours modifiable ensuite page par page.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
