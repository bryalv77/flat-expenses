export interface EmailEnv {
  /** Resend API key. With EMAIL_FROM it turns real sending on (needs a sending domain verified at Resend). */
  RESEND_API_KEY?: string;
  /** e.g. `Costos Piso <noreply@yourdomain.com>` */
  EMAIL_FROM?: string;
  /** `log` prints emails to the console instead (local dev and tests only: the text contains the reset link). */
  EMAIL_MODE?: string;
}

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(env: EmailEnv, email: Email): Promise<void> {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
    });
    if (!res.ok) throw new Error(`Resend rejected the email (HTTP ${res.status})`);
    return;
  }
  if (env.EMAIL_MODE === 'log') {
    console.log(`[email] to=${email.to} subject=${email.subject}\n${email.text}`);
    return;
  }
  // Not configured: say so, but never log the message (it holds a one-time reset link).
  console.warn('[email] not sent: set RESEND_API_KEY and EMAIL_FROM (or EMAIL_MODE=log in dev)');
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const COPY = {
  es: { subject: 'Restablece tu contraseña de Costos Piso', hi: (n: string) => `Hola ${n},`, body: 'Recibimos una solicitud para restablecer tu contraseña. El enlace caduca en 1 hora.', cta: 'Crear nueva contraseña', ignore: 'Si no fuiste tú, ignora este correo: tu contraseña no cambiará.' },
  en: { subject: 'Reset your Costos Piso password', hi: (n: string) => `Hi ${n},`, body: 'We received a request to reset your password. The link expires in 1 hour.', cta: 'Set a new password', ignore: "If this wasn't you, ignore this email: your password won't change." },
} as const;

/** Spanish unless the user's saved language is English (the app's default language is Spanish). */
export function resetPasswordEmail(user: { name: string; email: string; locale?: string | null }, url: string): Email {
  const c = COPY[user.locale === 'en' ? 'en' : 'es'];
  const text = `${c.hi(user.name)}\n\n${c.body}\n\n${url}\n\n${c.ignore}\n`;
  const html = `<p>${escapeHtml(c.hi(user.name))}</p><p>${c.body}</p><p><a href="${escapeHtml(url)}">${c.cta}</a></p><p style="color:#666">${c.ignore}</p>`;
  return { to: user.email, subject: c.subject, text, html };
}
