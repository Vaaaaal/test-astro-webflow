import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { PageEntry } from "@/lib/pagesStore";
import type { LocaleInfo } from "@/lib/localesStore";
import { CATEGORIES, CATEGORY_ADMIN_LABELS, type Category } from "@/config/categories";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EditPageDialogProps {
  entry: PageEntry | null;
  locales: LocaleInfo[];
  base: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: PageEntry) => void;
}

type SaveState = "idle" | "saving";
interface LocaleFormState {
  title: string;
  summary: string;
}

export function EditPageDialog({ entry, locales, base, onOpenChange, onSaved }: EditPageDialogProps) {
  const [selectedLocaleId, setSelectedLocaleId] = useState("");
  const [localeEdits, setLocaleEdits] = useState<Record<string, LocaleFormState>>({});
  const [category, setCategory] = useState<Category | "">("");
  const [visibleInSearch, setVisibleInSearch] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Only re-initialize form state when a *different* entry is opened for
  // editing — not on every prop update, since a successful save re-derives
  // `entry` from the parent's refreshed list and would otherwise clobber
  // any not-yet-saved edits sitting in another locale tab.
  const initializedForId = useRef<string | null>(null);
  useEffect(() => {
    if (!entry) {
      initializedForId.current = null;
      return;
    }
    if (initializedForId.current === entry.id) return;
    initializedForId.current = entry.id;

    const edits: Record<string, LocaleFormState> = {};
    for (const [localeId, content] of Object.entries(entry.locales)) {
      edits[localeId] = { title: content.title ?? "", summary: content.summary ?? "" };
    }
    setLocaleEdits(edits);
    const primaryLocaleId = locales.find((l) => l.isPrimary)?.id;
    setSelectedLocaleId(primaryLocaleId ?? Object.keys(entry.locales)[0] ?? "");
    setCategory(entry.category ?? "");
    setVisibleInSearch(entry.visibleInSearch);
    setSaveState("idle");
  }, [entry, locales]);

  const localeContent = entry?.locales[selectedLocaleId];
  const form = localeEdits[selectedLocaleId] ?? { title: "", summary: "" };

  function updateForm(patch: Partial<LocaleFormState>) {
    setLocaleEdits((prev) => ({
      ...prev,
      [selectedLocaleId]: { ...(prev[selectedLocaleId] ?? { title: "", summary: "" }), ...patch },
    }));
  }

  async function handleSave() {
    if (!entry) return;
    setSaveState("saving");
    try {
      const res = await fetch(`${base}/api/pages/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localeId: selectedLocaleId,
          title: form.title || null,
          summary: form.summary || null,
          category: category || null,
          visibleInSearch,
        }),
      });
      const data = (await res.json()) as { error?: string; entry?: PageEntry };
      if (!res.ok) {
        throw new Error(data?.error ?? `Échec de la sauvegarde (${res.status})`);
      }
      onSaved(data.entry as PageEntry);
      toast.success("Page mise à jour");
    } catch (err) {
      toast.error("Échec de la sauvegarde", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaveState("idle");
    }
  }

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {entry && (
          <>
        <DialogHeader>
          <DialogTitle>{localeContent?.publishedPath ?? ""}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-0.5 text-left">
              <p>Titre Webflow : {localeContent?.webflowTitle || "—"}</p>
              <p>Meta-description Webflow : {localeContent?.webflowMetaDescription || "—"}</p>
              <p>Dernière publication : {new Date(entry.lastPublishedAt).toLocaleString()}</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {locales.length > 1 && (
          <div>
            <div className="flex flex-wrap gap-1.5">
              {locales.map((locale) => (
                <Button
                  key={locale.id}
                  type="button"
                  size="sm"
                  variant={locale.id === selectedLocaleId ? "default" : "outline"}
                  onClick={() => setSelectedLocaleId(locale.id)}
                  disabled={!entry.locales[locale.id]}
                >
                  {locale.tag}
                </Button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Chaque langue s'enregistre séparément — vos saisies non enregistrées restent
              affichées si vous changez d'onglet.
            </p>
          </div>
        )}

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-title">Titre</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => updateForm({ title: "" })}
              >
                Réinitialiser
              </button>
            </div>
            <Input
              id="edit-title"
              value={form.title}
              onChange={(e) => updateForm({ title: e.target.value })}
              placeholder={localeContent?.webflowTitle || undefined}
              maxLength={200}
            />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-summary">Résumé</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => updateForm({ summary: "" })}
              >
                Réinitialiser
              </button>
            </div>
            <Textarea
              id="edit-summary"
              value={form.summary}
              onChange={(e) => updateForm({ summary: e.target.value })}
              placeholder={localeContent?.webflowMetaDescription || undefined}
              maxLength={2000}
              rows={4}
            />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-category">Catégorie</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setCategory("")}
              >
                Réinitialiser
              </button>
            </div>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger id="edit-category" className="w-full">
                <SelectValue placeholder="— choisir —" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_ADMIN_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="edit-visible">Visible dans la recherche</Label>
              <p className="text-sm text-muted-foreground">
                Désactive pour exclure cette page des résultats de recherche.
              </p>
            </div>
            <Switch id="edit-visible" checked={visibleInSearch} onCheckedChange={setVisibleInSearch} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          <Button onClick={handleSave} disabled={saveState === "saving"}>
            {saveState === "saving" ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
