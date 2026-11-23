// Reads the e-mails caught by the local Mailpit ("Inbucket", http://127.0.0.1:54324).
const MAILPIT = 'http://127.0.0.1:54324/api/v1';

export interface CaughtMail {
  from: string;
  subject: string;
  text: string;
  html: string;
}

/** Newest e-mail sent to `to` (optionally with a subject, or not containing a text); waits up to 10 s. */
export async function latestMail(
  to: string,
  filter: { subject?: string; notContaining?: string } = {},
): Promise<CaughtMail> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(
      `${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=5`,
    );
    const { messages } = (await search.json()) as { messages: { ID: string; Subject: string }[] };
    for (const summary of messages ?? []) {
      if (filter.subject && summary.Subject !== filter.subject) continue;
      const full = (await (await fetch(`${MAILPIT}/message/${summary.ID}`)).json()) as {
        From: { Address: string };
        Subject: string;
        Text: string;
        HTML: string;
      };
      if (filter.notContaining && full.Text.includes(filter.notContaining)) break;
      return { from: full.From.Address, subject: full.Subject, text: full.Text, html: full.HTML };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`no e-mail for ${to}`);
}
