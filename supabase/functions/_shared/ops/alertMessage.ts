// Operations alert e-mail (pure): plain French text for the operator, no user data.
export type OpsAlert = {
  kind: 'batch_missing' | 'batch_failed' | 'ai_cost' | string;
  day: string;
  detail: Record<string, unknown>;
  created_at: string;
};

function describe(alert: OpsAlert): string {
  const d = alert.detail ?? {};
  switch (alert.kind) {
    case 'batch_missing':
      return `Génération de secours absente depuis plus de 2 h (dernier passage : ${String(d.last_run ?? 'aucun')}).`;
    case 'batch_failed':
      return `Génération de secours en échec (passage du ${String(d.run ?? '?')}). Résumé : ${JSON.stringify(d.summary ?? {})}.`;
    case 'ai_cost':
      return `Coût IA du jour : ${String(d.cost_eur ?? '?')} €, au-dessus du seuil de ${String(d.threshold_eur ?? '?')} €.`;
    default:
      return `Alerte ${alert.kind} : ${JSON.stringify(d)}.`;
  }
}

export function buildAlertEmail(alerts: OpsAlert[], envName: string) {
  const subject = `[Daily Edge ${envName}] ${alerts.length} alerte${alerts.length > 1 ? 's' : ''} d'exploitation`;
  const lines = alerts.map((a) => `- ${a.day} : ${describe(a)}`);
  const text = [
    `Environnement : ${envName}`,
    '',
    ...lines,
    '',
    "Détail dans l'administration de l'app (Alertes) et procédure dans docs/exploitation.md.",
  ].join('\n');
  return { subject, text };
}
