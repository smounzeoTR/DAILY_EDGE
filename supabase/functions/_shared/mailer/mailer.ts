// Transactional e-mail behind one interface (site § 3): Scaleway TEM in production,
// Mailpit (the local Supabase "Inbucket") or the log locally.
// MAILER_PROVIDER = scaleway | mailpit | log (default: log, nothing is sent); sender: WAITLIST_FROM.

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  readonly provider: string;
  send(message: MailMessage): Promise<void>;
}

// Default sender; WAITLIST_FROM overrides it (always an address of auth.dailyedge.fr)
export const MAIL_FROM = { email: 'bonjour@auth.dailyedge.fr', name: 'Daily Edge' };
export type Sender = { email: string; name: string };

type Fetch = typeof fetch;

export function scalewayMailer(
  config: { secretKey: string; projectId: string; region: string; from?: Sender },
  fetchFn: Fetch = fetch,
): Mailer {
  const from = config.from ?? MAIL_FROM;
  return {
    provider: 'scaleway',
    async send(message) {
      const res = await fetchFn(
        `https://api.scaleway.com/transactional-email/v1alpha1/regions/${config.region}/emails`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Auth-Token': config.secretKey },
          body: JSON.stringify({
            from,
            to: [{ email: message.to }],
            subject: message.subject,
            text: message.text,
            html: message.html,
            project_id: config.projectId,
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok) throw new Error(`scaleway ${res.status}: ${(await res.text()).slice(0, 300)}`);
    },
  };
}

/** Mailpit HTTP send API (local stack only). */
export function mailpitMailer(
  baseUrl: string,
  fetchFn: Fetch = fetch,
  from: Sender = MAIL_FROM,
): Mailer {
  return {
    provider: 'mailpit',
    async send(message) {
      const res = await fetchFn(`${baseUrl.replace(/\/+$/, '')}/api/v1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: { Email: from.email, Name: from.name },
          To: [{ Email: message.to }],
          Subject: message.subject,
          Text: message.text,
          HTML: message.html,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`mailpit ${res.status}: ${(await res.text()).slice(0, 300)}`);
    },
  };
}

/** Writes the message to the log, recipient masked (local development). */
export function logMailer(log: (line: string) => void = console.log): Mailer {
  return {
    provider: 'log',
    send(message) {
      const masked = message.to.replace(/^(.).*@/, '$1***@');
      log(`[mail] to=${masked} subject=${message.subject}\n${message.text}`);
      return Promise.resolve();
    },
  };
}

export function mailerFromEnv(get: (name: string) => string | undefined): Mailer {
  const provider = get('MAILER_PROVIDER') || 'log';
  const required = (name: string) => {
    const value = get(name);
    if (!value) throw new Error(`missing env ${name}`);
    return value;
  };
  const fromEmail = get('WAITLIST_FROM')?.trim();
  const from: Sender = fromEmail ? { email: fromEmail, name: MAIL_FROM.name } : MAIL_FROM;
  switch (provider) {
    case 'scaleway':
      return scalewayMailer({
        secretKey: required('SCW_SECRET_KEY'),
        projectId: required('SCW_PROJECT_ID'),
        region: get('SCW_TEM_REGION') || 'fr-par',
        from,
      });
    case 'mailpit':
      return mailpitMailer(required('MAILPIT_URL'), fetch, from);
    case 'log':
      return logMailer();
    default:
      throw new Error(`unknown MAILER_PROVIDER ${provider}`);
  }
}
