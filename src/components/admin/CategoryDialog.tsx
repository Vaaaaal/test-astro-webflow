import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CategoryEntry } from "@/lib/categoriesStore";
import type { LocaleInfo } from "@/lib/localesStore";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CategoryDialogProps {
  base: string;
  entry?: CategoryEntry; // omit to create a new category
  locales: LocaleInfo[];
  onSaved: (entry: CategoryEntry) => void;
}

interface LocaleFormState {
  label: string;
  prefix: string;
}

const KEY_PATTERN = /^[a-z0-9-]+$/;

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      onClick={onClick}
    >
      Réinitialiser
    </button>
  );
}

export function CategoryDialog({ base, entry, locales, onSaved }: CategoryDialogProps) {
  const isEdit = entry !== undefined;
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(entry?.key ?? "");
  const [adminLabel, setAdminLabel] = useState(entry?.adminLabel ?? "");
  const [defaultPrefix, setDefaultPrefix] = useState(entry?.prefixes["*"] ?? "");
  // localeLabels/prefixes are keyed by locale TAG (e.g. "fr-FR"), not
  // Webflow's internal localeId — unlike PageEntry.locales.
  const [selectedTag, setSelectedTag] = useState("");
  const [localeEdits, setLocaleEdits] = useState<Record<string, LocaleFormState>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKey(entry?.key ?? "");
    setAdminLabel(entry?.adminLabel ?? "");
    setDefaultPrefix(entry?.prefixes["*"] ?? "");

    const edits: Record<string, LocaleFormState> = {};
    for (const locale of locales) {
      edits[locale.tag] = {
        label: entry?.localeLabels[locale.tag] ?? "",
        prefix: entry?.prefixes[locale.tag] ?? "",
      };
    }
    setLocaleEdits(edits);
    setSelectedTag(locales.find((l) => l.isPrimary)?.tag ?? locales[0]?.tag ?? "");
  }, [open, entry, locales]);

  const localeForm = localeEdits[selectedTag] ?? { label: "", prefix: "" };
  function updateLocaleForm(patch: Partial<LocaleFormState>) {
    setLocaleEdits((prev) => ({
      ...prev,
      [selectedTag]: { ...(prev[selectedTag] ?? { label: "", prefix: "" }), ...patch },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Build from the existing prefixes minus "*", then re-add it only if
      // set — an empty field must actually clear a previously-saved prefix,
      // not silently resend the stale value from `entry`.
      const { "*": _omit, ...otherPrefixes } = entry?.prefixes ?? {};
      const prefixes: Partial<Record<string, string>> = defaultPrefix
        ? { ...otherPrefixes, "*": defaultPrefix }
        : otherPrefixes;
      const localeLabels: Partial<Record<string, string>> = { ...(entry?.localeLabels ?? {}) };
      for (const [tag, form] of Object.entries(localeEdits)) {
        if (form.label) localeLabels[tag] = form.label;
        else delete localeLabels[tag];
        if (form.prefix) prefixes[tag] = form.prefix;
        else delete prefixes[tag];
      }

      const res = await fetch(
        isEdit ? `${base}/api/categories/${encodeURIComponent(entry.key)}` : `${base}/api/categories`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isEdit
              ? { adminLabel, prefixes, localeLabels }
              : { key, adminLabel, prefixes, localeLabels }
          ),
        }
      );
      const data = (await res.json()) as { error?: string; entry?: CategoryEntry };
      if (!res.ok) throw new Error(data?.error ?? `Échec (${res.status})`);
      onSaved(data.entry as CategoryEntry);
      toast.success(isEdit ? "Catégorie mise à jour" : "Catégorie créée");
      setOpen(false);
    } catch (err) {
      toast.error(isEdit ? "Échec de la mise à jour" : "Échec de la création", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="outline" size="sm">
            Modifier
          </Button>
        ) : (
          <Button>Ajouter une catégorie</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Modifier "${entry.key}"` : "Ajouter une catégorie"}</DialogTitle>
          {!isEdit && (
            <DialogDescription>
              La clé est définitive une fois créée — la renommer plus tard orphelinerait les pages
              déjà taguées avec elle.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {!isEdit && (
            <div className="grid gap-1.5">
              <Label htmlFor="category-key">Clé</Label>
              <Input
                id="category-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="etudes-de-cas"
              />
              <p className="text-xs text-muted-foreground">Minuscules, chiffres, tirets uniquement.</p>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="category-label">Libellé admin</Label>
            <Input
              id="category-label"
              value={adminLabel}
              onChange={(e) => setAdminLabel(e.target.value)}
              placeholder="Études de cas"
            />
            <p className="text-xs text-muted-foreground">
              Affiché dans cette interface d'admin, quelle que soit la langue de la page éditée.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="category-prefix">Préfixe d'URL par défaut (optionnel)</Label>
            <Input
              id="category-prefix"
              value={defaultPrefix}
              onChange={(e) => setDefaultPrefix(e.target.value)}
              placeholder="etudes-de-cas/"
            />
            <p className="text-xs text-muted-foreground">
              Une nouvelle page dont le slug commence par ce préfixe reçoit automatiquement cette
              catégorie — toujours modifiable ensuite page par page. Sert de repli pour toute langue
              sans préfixe dédié ci-dessous.
            </p>
          </div>

          {locales.length > 1 && (
            <div className="grid gap-3 rounded-lg border p-3">
              <div>
                <Label className="mb-1.5 block">Par langue — pour le futur widget de recherche public</Label>
                <div className="flex flex-wrap gap-1.5">
                  {locales.map((locale) => (
                    <Button
                      key={locale.tag}
                      type="button"
                      size="sm"
                      variant={locale.tag === selectedTag ? "default" : "outline"}
                      onClick={() => setSelectedTag(locale.tag)}
                    >
                      {locale.tag}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="category-locale-label" className="text-xs">
                    Libellé traduit
                  </Label>
                  <ResetButton onClick={() => updateLocaleForm({ label: "" })} />
                </div>
                <Input
                  id="category-locale-label"
                  value={localeForm.label}
                  onChange={(e) => updateLocaleForm({ label: e.target.value })}
                  placeholder={adminLabel || undefined}
                />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="category-locale-prefix" className="text-xs">
                    Préfixe pour cette langue
                  </Label>
                  <ResetButton onClick={() => updateLocaleForm({ prefix: "" })} />
                </div>
                <Input
                  id="category-locale-prefix"
                  value={localeForm.prefix}
                  onChange={(e) => updateLocaleForm({ prefix: e.target.value })}
                  placeholder={defaultPrefix || "utilise le préfixe par défaut"}
                />
                <p className="text-xs text-muted-foreground">
                  Uniquement si cette langue traduit le segment de dossier différemment (ex.
                  "articles/" au lieu de "blog/") — sinon laisser vide pour utiliser le préfixe par
                  défaut.
                </p>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !adminLabel || (!isEdit && !KEY_PATTERN.test(key))}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
