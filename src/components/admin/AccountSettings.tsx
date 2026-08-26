import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resizeImageToAvatar } from "@/lib/resizeImage";
import type { Role } from "@/config/roles";

interface AccountSettingsProps {
  base: string;
  initialUser: { email: string; role: Role; name: string | null; hasAvatar: boolean };
  emailChanged?: boolean;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "Lien de confirmation invalide.",
  invalid_or_expired_token: "Ce lien de confirmation a expiré ou a déjà été utilisé.",
  account_not_found: "Ce compte n'existe plus.",
  email_taken: "Cette adresse est déjà utilisée par un autre compte.",
};

export default function AccountSettings({ base, initialUser, emailChanged, error }: AccountSettingsProps) {
  const isBootstrapSuperAdmin = initialUser.role === "super_admin";

  const [name, setName] = useState(initialUser.name ?? "");
  const [nameSaving, setNameSaving] = useState(false);

  const [hasAvatar, setHasAvatar] = useState(initialUser.hasAvatar);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newEmail, setNewEmail] = useState("");
  const [emailRequestState, setEmailRequestState] = useState<"idle" | "sending" | "sent">("idle");
  const [devConfirmUrl, setDevConfirmUrl] = useState<string | null>(null);

  useEffect(() => {
    if (emailChanged) toast.success("Adresse email mise à jour");
    if (error) toast.error(ERROR_MESSAGES[error] ?? "Échec de la confirmation.");
  }, [emailChanged, error]);

  const initial = (name || initialUser.email).charAt(0).toUpperCase();
  const avatarSrc = hasAvatar
    ? `${base}/api/account/avatar/${encodeURIComponent(initialUser.email)}?v=${avatarVersion}`
    : undefined;

  async function handleSaveName() {
    setNameSaving(true);
    try {
      const res = await fetch(`${base}/api/account`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`Échec (${res.status})`);
      toast.success("Nom mis à jour");
    } catch (err) {
      toast.error("Échec de la mise à jour du nom", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setNameSaving(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setAvatarBusy(true);
    try {
      const resized = await resizeImageToAvatar(file);
      const formData = new FormData();
      formData.append("avatar", resized, "avatar.webp");
      const res = await fetch(`${base}/api/account/avatar`, { method: "POST", body: formData });
      if (!res.ok) throw new Error(`Échec (${res.status})`);
      setHasAvatar(true);
      setAvatarVersion((v) => v + 1);
      toast.success("Photo de profil mise à jour");
    } catch (err) {
      toast.error("Échec de l'envoi de la photo", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleRemoveAvatar() {
    setAvatarBusy(true);
    try {
      const res = await fetch(`${base}/api/account/avatar`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Échec (${res.status})`);
      setHasAvatar(false);
      toast.success("Photo de profil retirée");
    } catch (err) {
      toast.error("Échec du retrait de la photo", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleRequestEmailChange(e: React.SubmitEvent) {
    e.preventDefault();
    setEmailRequestState("sending");
    try {
      const res = await fetch(`${base}/api/account/request-email-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail }),
      });
      const data = (await res.json()) as { error?: string; devConfirmUrl?: string };
      if (!res.ok) throw new Error(data?.error ?? `Échec (${res.status})`);
      setDevConfirmUrl(data.devConfirmUrl ?? null);
      setEmailRequestState("sent");
    } catch (err) {
      setEmailRequestState("idle");
      toast.error("Échec de la demande de changement", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>Photo et nom affichés dans l'interface d'administration.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 rounded-lg">
              {avatarSrc && <AvatarImage src={avatarSrc} alt="" />}
              <AvatarFallback className="rounded-lg text-lg">{initial}</AvatarFallback>
            </Avatar>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={avatarBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarBusy ? "…" : "Changer la photo"}
              </Button>
              {hasAvatar && (
                <Button type="button" variant="ghost" size="sm" disabled={avatarBusy} onClick={handleRemoveAvatar}>
                  Retirer
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="account-name">Nom complet</Label>
            <div className="flex gap-2">
              <Input
                id="account-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Votre nom"
                maxLength={200}
              />
              <Button type="button" onClick={handleSaveName} disabled={nameSaving}>
                {nameSaving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adresse email</CardTitle>
          <CardDescription>
            Utilisée pour se connecter (lien de connexion à usage unique) — un changement doit être
            confirmé depuis la nouvelle adresse.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
            <span>{initialUser.email}</span>
            <Badge variant="outline">{initialUser.role}</Badge>
          </div>

          {isBootstrapSuperAdmin ? (
            <p className="text-sm text-muted-foreground">
              Cet accès super_admin est accordé via la configuration du serveur (variable
              SUPER_ADMIN_EMAILS), pas via un compte modifiable ici — contacte la personne qui gère
              le déploiement pour changer cette adresse.
            </p>
          ) : emailRequestState === "sent" ? (
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Vérifie ta boîte mail à {newEmail}</p>
              <p className="mt-1 text-muted-foreground">
                Un lien de confirmation vient d'être envoyé. Il expire dans 15 minutes et ne peut être
                utilisé qu'une fois.
              </p>
              {devConfirmUrl && (
                <div className="mt-2">
                  <p className="mb-1 text-xs text-muted-foreground">Lien de dev (jamais affiché en production) :</p>
                  <a href={devConfirmUrl} className="break-all text-xs text-primary underline">
                    {devConfirmUrl}
                  </a>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleRequestEmailChange} className="grid gap-1.5">
              <Label htmlFor="account-new-email">Nouvelle adresse</Label>
              <div className="flex gap-2">
                <Input
                  id="account-new-email"
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="nouvelle@exemple.com"
                />
                <Button type="submit" disabled={emailRequestState === "sending"}>
                  {emailRequestState === "sending" ? "Envoi…" : "Changer d'adresse"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
