// Republishes the previous successful production deployment of a Cloudflare Pages project
// (one-click rollback). Needs CLOUDFLARE_API_TOKEN (Pages: Edit) and CLOUDFLARE_ACCOUNT_ID.
// Usage: node scripts/pages-rollback.mjs <project> [--dry-run]
const [project, flag] = process.argv.slice(2);
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!project || !token || !account) {
  console.error(
    'usage: pages-rollback.mjs <project> [--dry-run] (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID)',
  );
  process.exit(2);
}
const api = `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const list = await (
  await fetch(`${api}/deployments?env=production&per_page=25`, { headers })
).json();
if (!list.success) throw new Error(`deployments: ${JSON.stringify(list.errors)}`);
const done = list.result.filter((d) => d.latest_stage?.status === 'success');
const [current, previous] = done;
if (!current || !previous) {
  console.error('Pas de version précédente à republier.');
  process.exit(1);
}
const short = (d) =>
  `${d.id.slice(0, 8)} (${d.created_on}, commit ${d.deployment_trigger?.metadata?.commit_hash?.slice(0, 7) ?? '?'})`;
console.log(`Actuelle : ${short(current)}\nRepublier : ${short(previous)}`);
if (flag === '--dry-run') process.exit(0);
const res = await (
  await fetch(`${api}/deployments/${previous.id}/rollback`, { method: 'POST', headers })
).json();
if (!res.success) throw new Error(`rollback: ${JSON.stringify(res.errors)}`);
console.log(`✅ Version ${previous.id.slice(0, 8)} republiée en production.`);
