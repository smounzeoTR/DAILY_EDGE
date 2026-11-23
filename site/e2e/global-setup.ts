// Empties the local rate limit counters before the run (every local request shares one IP).
import { execSync } from 'node:child_process';

export default async function globalSetup() {
  try {
    const status = JSON.parse(execSync('supabase status -o json', { encoding: 'utf8' })) as {
      API_URL: string;
      SERVICE_ROLE_KEY: string;
    };
    await fetch(`${status.API_URL}/rest/v1/rate_limit_hits?id=gte.0`, {
      method: 'DELETE',
      headers: {
        apikey: status.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
      },
    });
  } catch {
    // Local stack not started: the pages tests still run
  }
}
