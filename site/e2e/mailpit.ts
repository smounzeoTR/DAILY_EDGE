// Reads the e-mails caught by the local Mailpit ("Inbucket", http://127.0.0.1:54324).
const MAILPIT = 'http://127.0.0.1:54324/api/v1';

/** Text of the newest e-mail sent to `to`; waits up to 10 s. */
export async function latestMailText(to: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(
      `${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=1`,
    );
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    const first = messages?.[0];
    if (first) {
      const full = (await (await fetch(`${MAILPIT}/message/${first.ID}`)).json()) as {
        Text: string;
      };
      return full.Text;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`no e-mail for ${to}`);
}

/** Path of the confirmation link (/confirmer#t=…) found in an e-mail. */
export function confirmPath(text: string): string {
  const match = text.match(/\/confirmer#t=[A-Za-z0-9_-]{43}/);
  if (!match) throw new Error('no confirmation link');
  return match[0];
}
