// The integration tests must never call a real (paid) AI provider: supabase/functions/.env would be
// loaded by the local Edge runtime and replace the mock provider of config.toml.
import { existsSync } from 'node:fs';

export function assertMockProviders(): void {
  if (existsSync(new URL('../../supabase/functions/.env', import.meta.url))) {
    throw new Error(
      'supabase/functions/.env exists: the local Edge runtime would use a real AI provider. ' +
        'Move it to .env.llm at the repository root, then: docker restart supabase_edge_runtime_daily-edge',
    );
  }
}
