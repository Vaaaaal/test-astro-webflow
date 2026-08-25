import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LoginFormProps {
  base: string;
  verifyError?: string;
}

const VERIFY_ERROR_MESSAGES: Record<string, string> = {
  missing_token: "Lien de connexion invalide.",
  invalid_or_expired_token: "Ce lien de connexion a expiré ou a déjà été utilisé.",
  not_authorized: "Cet accès n'est plus autorisé.",
};

type State = "idle" | "submitting" | "sent";

export default function LoginForm({ base, verifyError }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [devMagicLinkUrl, setDevMagicLinkUrl] = useState<string | null>(null);

  useEffect(() => {
    if (verifyError) {
      toast.error(VERIFY_ERROR_MESSAGES[verifyError] ?? "Échec de la connexion.");
    }
  }, [verifyError]);

  async function handleSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    setState("submitting");
    try {
      const res = await fetch(`${base}/api/auth/request-magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { error?: string; devMagicLinkUrl?: string };
      if (!res.ok) {
        throw new Error(data?.error ?? `Échec (${res.status})`);
      }
      setDevMagicLinkUrl(data.devMagicLinkUrl ?? null);
      setState("sent");
    } catch (err) {
      setState("idle");
      toast.error("Échec de l'envoi du lien", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (state === "sent") {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Vérifiez votre boîte mail</CardTitle>
          <CardDescription>
            Si {email} est autorisé, un lien de connexion vient d'être envoyé. Il expire dans 15
            minutes et ne peut être utilisé qu'une fois.
          </CardDescription>
        </CardHeader>
        {devMagicLinkUrl && (
          <CardContent>
            <p className="mb-1 text-xs text-muted-foreground">Lien de dev (jamais affiché en production) :</p>
            <a href={devMagicLinkUrl} className="break-all text-xs text-primary underline">
              {devMagicLinkUrl}
            </a>
          </CardContent>
        )}
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Connexion</CardTitle>
        <CardDescription>Entrez votre email pour recevoir un lien de connexion.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
            />
          </div>
          <Button type="submit" disabled={state === "submitting"}>
            {state === "submitting" ? "Envoi…" : "Recevoir le lien de connexion"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
