/**
 * Vercel Serverless Function: Custom Domain + Auto-SSL Provisioning Proxy
 *
 * Environment Variables (set on the `studio/` Vercel project):
 *   - VERCEL_API_TOKEN: Vercel Personal/Team Access Token
 *   - VERCEL_TENANT_PROJECT_ID: Project ID or name of the deployed TradersPulse Tenant Runtime
 *   - VERCEL_TEAM_ID: (Optional) Vercel Team ID (`team_...`)
 */

const FORBIDDEN_TRADEMARKS = ['deriv', 'binary'];

function validateDomainName(rawDomain) {
  const cleaned = String(rawDomain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

  if (!cleaned || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(cleaned)) {
    return { valid: false, domain: cleaned, error: 'Enter a valid domain name (e.g. mybrand.site or app.mybrand.com).' };
  }

  for (const word of FORBIDDEN_TRADEMARKS) {
    if (cleaned.includes(word)) {
      return {
        valid: false,
        domain: cleaned,
        error: `Domain names containing "${word}" are prohibited under Deriv Partner compliance rules.`,
      };
    }
  }

  return { valid: true, domain: cleaned };
}

function buildDnsRecords(domain) {
  const parts = domain.split('.');
  const isApex = parts.length === 2;
  if (isApex) {
    return [
      { type: 'A', host: '@', value: '76.76.21.21', ttl: 'Auto' },
      { type: 'CNAME', host: 'www', value: 'cname.vercel-dns.com', ttl: 'Auto' },
    ];
  }
  return [{ type: 'CNAME', host: parts[0], value: 'cname.vercel-dns.com', ttl: 'Auto' }];
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_TENANT_PROJECT_ID;
  const teamQuery = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '';

  const rawDomain = req.method === 'GET' || req.method === 'DELETE' ? req.query?.domain : req.body?.domain;
  const check = validateDomainName(rawDomain);

  if (!check.valid) {
    return res.status(400).json({ ok: false, error: check.error });
  }

  const domain = check.domain;
  const dnsRecords = buildDnsRecords(domain);

  if (!token || !projectId) {
    return res.status(503).json({
      ok: false,
      domain,
      dns_records: dnsRecords,
      error:
        'Missing VERCEL_API_TOKEN or VERCEL_TENANT_PROJECT_ID in your Studio Vercel Environment Variables. Add both and redeploy to attach and verify custom domains.',
    });
  }

  try {
    if (req.method === 'POST' && req.body?.action === 'verify') {
      const verifyResp = await fetch(
        `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}/verify${teamQuery}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await verifyResp.json();
      const verified = Boolean(data?.verified);
      return res.status(verifyResp.ok ? 200 : 400).json({
        ok: verifyResp.ok,
        domain,
        verified,
        domain_status: verified ? 'live' : 'verify_dns',
        dns_records: dnsRecords,
        vercel: data,
        error: !verifyResp.ok ? data?.error?.message || 'DNS verification pending' : undefined,
      });
    }

    if (req.method === 'POST') {
      const addResp = await fetch(
        `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/domains${teamQuery}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: domain }),
        }
      );
      const data = await addResp.json();
      const verified = Boolean(data?.verified);
      return res.status(addResp.ok ? 200 : 400).json({
        ok: addResp.ok,
        domain,
        verified,
        domain_status: verified ? 'live' : 'verify_dns',
        dns_records: dnsRecords,
        vercel: data,
        error: !addResp.ok ? data?.error?.message || 'Vercel domain attach failed' : undefined,
      });
    }

    if (req.method === 'DELETE') {
      const delResp = await fetch(
        `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}${teamQuery}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      return res.status(delResp.ok ? 200 : 400).json({ ok: delResp.ok, domain });
    }

    if (req.method === 'GET') {
      const getResp = await fetch(
        `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}${teamQuery}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await getResp.json();
      const verified = Boolean(data?.verified);
      return res.status(getResp.ok ? 200 : 400).json({
        ok: getResp.ok,
        domain,
        verified,
        domain_status: verified ? 'live' : 'verify_dns',
        dns_records: dnsRecords,
        vercel: data,
      });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unexpected Vercel API error',
    });
  }
};
