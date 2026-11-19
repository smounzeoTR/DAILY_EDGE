/* global MAILPIT_URL, http, json, output */
// Maestro (GraalJS) globals. Reads the latest sign-in code sent to output.email from Mailpit (local Supabase).
const base = MAILPIT_URL || 'http://127.0.0.1:54324';
const search = http.get(
  base + '/api/v1/search?query=' + encodeURIComponent('to:"' + output.email + '"'),
);
const messages = json(search.body).messages || [];
if (messages.length === 0) throw new Error('No email found in Mailpit for ' + output.email);
const message = json(http.get(base + '/api/v1/message/' + messages[0].ID).body);
const match = (message.HTML || '').match(/>\s*(\d{6})\s*</);
if (!match) throw new Error('No 6-digit code in the email');
output.code = match[1];
