export type EmailEnv = {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  APP_ORIGIN?: string;
  ALLOW_DEV_MAGIC_LINKS?: string;
};

type SendMagicLinkArgs = {
  env: EmailEnv;
  to: string;
  magicLink: string;
};

export function normalizeRedirectPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  if (trimmed.length > 240) return "/";
  if (/[\r\n<>]/.test(trimmed)) return "/";
  return trimmed || "/";
}

export function appOrigin(requestUrl: string, configuredOrigin?: string): string {
  const configured = configuredOrigin?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const url = new URL(requestUrl);
  return `${url.protocol}//${url.host}`;
}

export function buildMagicLink(origin: string, token: string): string {
  return `${origin}/#/auth/callback?token=${encodeURIComponent(token)}`;
}

export function canReturnDevMagicLink(requestUrl: string, env: EmailEnv): boolean {
  if (env.ALLOW_DEV_MAGIC_LINKS === "true") return true;
  const host = new URL(requestUrl).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendMagicLinkEmail({
  env,
  to,
  magicLink,
}: SendMagicLinkArgs): Promise<{ sent: true } | { sent: false; reason: "missing-key" }> {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false, reason: "missing-key" };

  const from = env.RESEND_FROM_EMAIL?.trim() || "Pilpul <onboarding@resend.dev>";
  const safeLink = escapeHtml(magicLink);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Your Pilpul sign-in link",
      text: `Open this link to enter Pilpul:\n\n${magicLink}\n\nThis link expires in 20 minutes. If you did not ask for it, ignore this email.`,
      html: `
        <div style="font-family: Georgia, serif; color: #2a2520; line-height: 1.6;">
          <p>Open this link to enter Pilpul:</p>
          <p><a href="${safeLink}" style="color: #8b6f47;">Enter Pilpul</a></p>
          <p style="font-size: 13px; color: #6b645c;">This link expires in 20 minutes. If you did not ask for it, ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { message?: unknown; error?: unknown };
      if (typeof body.message === "string") detail = body.message;
      else if (typeof body.error === "string") detail = body.error;
    } catch {}
    throw new Error(`send magic link email: ${detail}`);
  }

  return { sent: true };
}

