import { assertConfigured, HttpError } from './http';
import type { WebsiteFiles } from './schema';

function teamQuery() {
  const team = process.env.VERCEL_TEAM_ID;
  return team ? `?teamId=${encodeURIComponent(team)}` : '';
}
async function request(path: string, init?: RequestInit) {
  assertConfigured('VERCEL_API_TOKEN');
  const res = await fetch(`https://api.vercel.com${path}${teamQuery()}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`, 'Content-Type': 'application/json' },
    cache: 'no-store', signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new HttpError(502, 'Vercel rejected the request. Check the server integration and deployment permissions.');
  return res.json();
}
export async function createStaticDeployment(projectId: string, files: WebsiteFiles) {
  // Only explicit static files are uploaded. No generated code is executed on this server.
  return request('/v13/deployments', { method: 'POST', body: JSON.stringify({
    name: `nexora-${projectId.replace(/-/g, '')}`,
    target: 'production',
    projectSettings: { framework: null },
    files: Object.entries(files).map(([file, data]) => ({ file, data })),
  }) });
}
export async function getVercelDeployment(id: string) {
  if (!/^dpl_[a-zA-Z0-9]+$/.test(id)) throw new HttpError(400, 'Invalid deployment id.');
  return request(`/v13/deployments/${encodeURIComponent(id)}`);
}
export function safeVercelUrl(host: unknown): string | null {
  if (typeof host !== 'string' || !/^[a-z0-9][a-z0-9.-]*\.vercel\.app$/i.test(host)) return null;
  return `https://${host}`;
}
