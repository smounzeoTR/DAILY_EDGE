// Brand e-mail template (French): HTML with inline styles and its plain-text version.
export interface EmailSection {
  heading?: string;
  paragraphs: string[];
}

export interface EmailButton {
  label: string;
  url: string;
}

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const P = 'margin:0 0 16px;font-size:16px;line-height:1.6;color:#0B1B3F';
const H2 =
  "margin:24px 0 8px;font-family:'Space Grotesk',Arial,sans-serif;font-size:18px;color:#0B1B3F";

function buttonHtml(button: EmailButton, primary: boolean) {
  const style = primary
    ? 'background:#2F5BFF;color:#FFFFFF;border:2px solid #2F5BFF'
    : 'background:#FFFFFF;color:#0B1B3F;border:2px solid #6E7896';
  return `<p style="margin:16px 0"><a href="${escape(button.url)}" style="display:inline-block;padding:14px 28px;border-radius:28px;${style};font-weight:600;text-decoration:none">${escape(button.label)}</a></p>`;
}

export function renderEmail(input: {
  title: string;
  intro: string[];
  sections?: EmailSection[];
  buttons?: EmailButton[];
  footnote?: string;
}): { html: string; text: string } {
  const sections = input.sections ?? [];
  const buttons = input.buttons ?? [];
  const body = [
    ...input.intro.map((p) => `<p style="${P}">${escape(p)}</p>`),
    ...sections.map(
      (s) =>
        (s.heading ? `<h2 style="${H2}">${escape(s.heading)}</h2>` : '') +
        s.paragraphs.map((p) => `<p style="${P}">${escape(p)}</p>`).join(''),
    ),
    ...buttons.map((b, i) => buttonHtml(b, i === 0)),
    input.footnote
      ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#4A5578">${escape(input.footnote)}</p>`
      : '',
  ].join('');
  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(input.title)}</title></head>
<body style="margin:0;padding:0;background:#F3F5FB;font-family:Inter,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5FB;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #D5DBEC;border-radius:20px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:22px;color:#0B1B3F">daily<span style="color:#2F5BFF">edge</span></p>
<h1 style="margin:0 0 16px;font-family:'Space Grotesk',Arial,sans-serif;font-size:24px;line-height:1.2;color:#0B1B3F">${escape(input.title)}</h1>
${body}
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#4A5578">Daily Edge · 1 % de mieux, chaque jour.</p>
</td></tr>
</table>
</body>
</html>`;
  const text = [
    input.title,
    '',
    ...input.intro.flatMap((p) => [p, '']),
    ...sections.flatMap((s) => [
      ...(s.heading ? [s.heading] : []),
      ...s.paragraphs,
      '',
    ]),
    ...buttons.map((b) => `${b.label} : ${b.url}`),
    ...(input.footnote ? ['', input.footnote] : []),
    '',
    '—',
    'Daily Edge · 1 % de mieux, chaque jour.',
  ].join('\n');
  return { html, text };
}
