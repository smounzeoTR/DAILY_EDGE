// Solves an ALTCHA challenge of the local stack, as the site widget does (payload: base64 JSON of
// { challenge, solution }). The local challenges are easy (config.toml: ALTCHA_COST).
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';

export async function altchaPayload(functionsUrl: string): Promise<string> {
  const res = await fetch(`${functionsUrl}/altcha-challenge`);
  if (!res.ok) throw new Error(`altcha-challenge ${res.status}`);
  const challenge = await res.json();
  const solution = await solveChallenge({ challenge, deriveKey });
  if (!solution) throw new Error('altcha challenge not solved');
  return Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');
}
