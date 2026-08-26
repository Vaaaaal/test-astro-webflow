const RESEND_API_URL = "https://api.resend.com/emails";

export interface SendMagicLinkEmailParams {
  apiKey: string;
  from: string;
  to: string;
  magicLinkUrl: string;
}

/**
 * NOTE: this request shape is a best-effort reconstruction of the Resend
 * API from general knowledge — it has NOT been verified against a live
 * account or the current Resend docs (no Resend SDK is installed in this
 * repo to trace). Smoke-test with a real API key + verified sending domain
 * before relying on this in production.
 */
export async function sendMagicLinkEmail(params: SendMagicLinkEmailParams): Promise<void> {
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: "Votre lien de connexion",
      html: `<p>Cliquez pour vous connecter : <a href="${params.magicLinkUrl}">${params.magicLinkUrl}</a></p><p>Ce lien expire dans 15 minutes et ne peut être utilisé qu'une fois.</p>`,
      text: `Cliquez pour vous connecter : ${params.magicLinkUrl}\n\nCe lien expire dans 15 minutes et ne peut être utilisé qu'une fois.`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed: ${res.status} ${body}`);
  }
}

export interface SendEmailChangeConfirmationParams {
  apiKey: string;
  from: string;
  to: string;
  currentEmail: string;
  confirmUrl: string;
}

export async function sendEmailChangeConfirmationEmail(
  params: SendEmailChangeConfirmationParams
): Promise<void> {
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: "Confirme ta nouvelle adresse email",
      html: `<p>Confirme le changement d'adresse email de ton compte Minisearch (actuellement ${params.currentEmail}) vers cette adresse : <a href="${params.confirmUrl}">${params.confirmUrl}</a></p><p>Ce lien expire dans 15 minutes et ne peut être utilisé qu'une fois. Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>`,
      text: `Confirme le changement d'adresse email de ton compte Minisearch (actuellement ${params.currentEmail}) vers cette adresse : ${params.confirmUrl}\n\nCe lien expire dans 15 minutes et ne peut être utilisé qu'une fois. Si tu n'es pas à l'origine de cette demande, ignore cet email.`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed: ${res.status} ${body}`);
  }
}
