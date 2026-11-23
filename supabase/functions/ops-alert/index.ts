// ops-alert: e-mails the pending operations alerts (ops_alerts.notified_at null) to the operator.
// Called by pg_cron (run_ops_checks) with the shared server secret (header x-batch-secret).
// Provider: OPS_ALERT_EMAIL_PROVIDER = "scaleway" (Transactional Email API, EU) or "none"
// (default: alerts stay pending and are shown in the administration only).
import { env, json, serviceClient } from '../_shared/plans/generatePlan.ts';
import { buildAlertEmail, type OpsAlert } from '../_shared/ops/alertMessage.ts';
import { safeEqual } from '../_shared/ops/secret.ts';

async function sendWithScaleway(subject: string, text: string): Promise<void> {
  const region = Deno.env.get('SCW_REGION') || 'fr-par';
  const res = await fetch(
    `https://api.scaleway.com/transactional-email/v1alpha1/regions/${region}/emails`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': env('SCW_SECRET_KEY') },
      body: JSON.stringify({
        from: { email: env('OPS_ALERT_FROM'), name: 'Daily Edge' },
        to: env('OPS_ALERT_TO')
          .split(',')
          .map((email) => ({ email: email.trim() })),
        subject,
        text,
        project_id: env('SCW_PROJECT_ID'),
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) throw new Error(`scaleway ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const secret = req.headers.get('x-batch-secret') ?? '';
  if (!secret || !safeEqual(secret, env('PLANS_BATCH_SECRET'))) {
    return json(401, { error: 'unauthorized' });
  }

  const db = serviceClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data, error } = await db
    .from('ops_alerts')
    .select('id, kind, day, detail, created_at')
    .is('notified_at', null)
    .order('created_at');
  if (error) {
    console.error('ops_alerts read failed', error);
    return json(500, { error: 'internal_error' });
  }
  const alerts = (data ?? []) as (OpsAlert & { id: string })[];
  if (alerts.length === 0) return json(200, { pending: 0, sent: 0 });

  const provider = Deno.env.get('OPS_ALERT_EMAIL_PROVIDER') || 'none';
  if (provider !== 'scaleway') return json(200, { pending: alerts.length, sent: 0, provider });

  const { subject, text } = buildAlertEmail(alerts, Deno.env.get('OPS_ENV_NAME') || 'inconnu');
  try {
    await sendWithScaleway(subject, text);
  } catch (err) {
    console.error('ops alert e-mail failed', err);
    return json(502, { error: 'send_failed', pending: alerts.length });
  }
  const { error: markError } = await db
    .from('ops_alerts')
    .update({ notified_at: new Date().toISOString() })
    .in(
      'id',
      alerts.map((a) => a.id),
    );
  if (markError) console.error('ops_alerts mark failed', markError);
  return json(200, { pending: 0, sent: alerts.length, provider });
});
