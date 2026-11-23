// Waitlist e-mails (French), each with an HTML and a plain-text version.
// Links carry the token only, in the URL fragment (never sent to a server, never in logs).

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function confirmUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/confirmer#t=${token}`;
}

export function statusUrl(siteUrl: string, statusToken: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/ma-place#s=${statusToken}`;
}

function layout(title: string, paragraphs: string[], button: { label: string; url: string }) {
  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#0B1B3F">${escape(p)}</p>`,
    )
    .join('');
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#F3F5FB;font-family:Inter,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5FB;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #D5DBEC;border-radius:20px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:22px;color:#0B1B3F">daily<span style="color:#2F5BFF">edge</span></p>
<h1 style="margin:0 0 16px;font-family:'Space Grotesk',Arial,sans-serif;font-size:24px;line-height:1.2;color:#0B1B3F">${escape(title)}</h1>
${body}
<p style="margin:24px 0"><a href="${escape(button.url)}" style="display:inline-block;padding:16px 32px;border-radius:28px;background:#2F5BFF;color:#FFFFFF;font-weight:600;text-decoration:none">${escape(button.label)}</a></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#4A5578">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br><a href="${escape(button.url)}" style="color:#2F5BFF;word-break:break-all">${escape(button.url)}</a></p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#4A5578">Daily Edge · 1 % de mieux, chaque jour.</p>
</td></tr>
</table>
</body>
</html>`;
}

function text(title: string, paragraphs: string[], button: { label: string; url: string }) {
  return [
    title,
    '',
    ...paragraphs.flatMap((p) => [p, '']),
    `${button.label} : ${button.url}`,
    '',
    '—',
    'Daily Edge · 1 % de mieux, chaque jour.',
  ].join('\n');
}

export function confirmEmail(url: string): EmailContent {
  const title = 'Confirme ton inscription';
  const paragraphs = [
    'Merci de rejoindre la liste d’attente de Daily Edge.',
    'Un clic pour confirmer ton adresse et réserver ta place. Ce lien est valable 48 heures.',
    'Si tu n’es pas à l’origine de cette demande, ignore simplement cet e-mail : rien ne sera enregistré à ton nom.',
  ];
  const button = { label: 'Confirmer mon inscription', url };
  return {
    subject: 'Confirme ton inscription à Daily Edge',
    html: layout(title, paragraphs, button),
    text: text(title, paragraphs, button),
  };
}

export function alreadyConfirmedEmail(url: string): EmailContent {
  const title = 'Ta place est déjà réservée';
  const paragraphs = [
    'Tu fais déjà partie de la liste d’attente de Daily Edge : pas besoin de recommencer.',
    'Retrouve ton rang et ton lien de parrainage à tout moment avec le bouton ci-dessous.',
  ];
  const button = { label: 'Voir ma place', url };
  return {
    subject: 'Ta place Daily Edge est déjà réservée',
    html: layout(title, paragraphs, button),
    text: text(title, paragraphs, button),
  };
}
