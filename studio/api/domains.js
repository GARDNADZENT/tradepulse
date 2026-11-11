/**
 * Vercel Serverless Function: Automatic <slug>.vercel.app Provisioning + Custom Domain Auto-SSL
 *
 * Environment Variables (set on the `studio/` Vercel project):
 *   - VERCEL_API_TOKEN: Vercel Personal/Team Access Token (from vercel.com/account/tokens)
 *   - VERCEL_TENANT_PROJECT_ID: Project ID or name of the TradersPulse Runtime project (e.g. `tradepulse-lovat`)
 *   - VERCEL_TEAM_ID: (Optional) Vercel Team ID (`team_...`)
 */

const FORBIDDEN_TRADEMARKS = ['deriv', 'binary'];
const RESERVED_SLUGS = new Set([
  'tradepulse-lovat',
  'tradepulse-tracker2',
  'tradepulse-studio',
  'studio',
  'admin',
  'api',
  'auth',
  'www',
]);

function validateSlugForVercel(rawSlug) {
  const slug = String(rawSlug || '')
    .trim()
    .toLowerCase()
    .replace(/\.vercel\.app$/i, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug || slug.length < 2 || slug.length > 50 || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return {
      valid: false,
      slug,
      error: 'Site URL name must be 2–50 lowercase letters, numbers, or hyphens.',
    };
  }

  if (RESERVED_SLUGS.has(slug)) {
    return {
      valid: false,
      slug,
      error: `"${slug}" is reserved. Choose a unique brand name (e.g. ${slug}-desk).`,
    };
  }

  for (const word of FORBIDDEN_TRADEMARKS) {
    if (slug.includes(word)) {
      return {
        valid: false,
        slug,
        error: `URLs containing "${word}" are prohibited under Deriv Partner compliance rules.`,
      };
    }
  }

  return { valid: true, slug, vercelDomain: `${slug}.vercel.app` };
}

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

  const token = (process.env.VERCEL_API_TOKEN || '').trim();
  const projectId = (process.env.VERCEL_TENANT_PROJECT_ID || '').trim();
  const teamQuery = process.env.VERCEL_TEAM_ID
    ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID.trim())}`
    : '';

  const action = req.body?.action || req.query?.action || '';

  // =========================================================================
  // 1. CHECK OR AUTO-PROVISION <slug>.vercel.app SUBDOMAIN
  // =========================================================================
  if (action === 'check_vercel_subdomain' || action === 'provision_vercel_subdomain') {
    const rawSlug = req.body?.slug || req.query?.slug || '';
    const check = validateSlugForVercel(rawSlug);
    if (!check.valid) {
      return res.status(400).json({ ok: false, available: false, error: check.error });
    }

    const { slug, vercelDomain } = check;

    if (!token || !projectId) {
      if (action === 'check_vercel_subdomain') {
        return res.status(200).json({
          ok: true,
          available: true,
          env_missing: true,
          slug,
          vercel_domain: vercelDomain,
          url: `https://${vercelDomain}`,
        });
      }
      return res.status(200).json({
        ok: false,
        env_missing: true,
        slug,
        vercel_domain: vercelDomain,
        vercel_domain_status: 'pending',
        url: `https://${vercelDomain}`,
        error:
          'Site saved! To auto-activate https://' +
          vercelDomain +
          ' on Vercel, add VERCEL_API_TOKEN and VERCEL_TENANT_PROJECT_ID in your Studio Vercel Environment Variables and click "Activate .vercel.app URL".',
      });
    }

    try {
      if (action === 'check_vercel_subdomain') {
        const existingResp = await fetch(
          `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(vercelDomain)}${teamQuery}`,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (existingResp.ok) {
          return res.status(200).json({
            ok: true,
            available: false,
            already_on_project: true,
            slug,
            vercel_domain: vercelDomain,
            url: `https://${vercelDomain}`,
            error: `${vercelDomain} is already assigned to an existing site.`,
          });
        }
        return res.status(200).json({
          ok: true,
          available: true,
          slug,
          vercel_domain: vercelDomain,
          url: `https://${vercelDomain}`,
        });
      }

      // action === 'provision_vercel_subdomain'
      const addResp = await fetch(
        `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/domains${teamQuery}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: vercelDomain }),
        }
      );
      const addData = await addResp.json();

      if (addResp.ok) {
        return res.status(200).json({
          ok: true,
          slug,
          vercel_domain: vercelDomain,
          vercel_domain_status: 'live',
          url: `https://${vercelDomain}`,
        });
      }

      // Check if it's already attached to our own runtime project (idempotent re-publish)
      const checkOwn = await fetch(
        `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(vercelDomain)}${teamQuery}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (checkOwn.ok) {
        return res.status(200).json({
          ok: true,
          slug,
          vercel_domain: vercelDomain,
          vercel_domain_status: 'live',
          url: `https://${vercelDomain}`,
        });
      }

      return res.status(409).json({
        ok: false,
        taken: true,
        slug,
        vercel_domain: vercelDomain,
        error:
          addData?.error?.message ||
          `${vercelDomain} is already taken on Vercel — try "${slug}-fx" or "${slug}-trade".`,
      });
    } catch (err) {
      return res.status(502).json({
        ok: false,
        slug,
        vercel_domain: vercelDomain,
        error: `Failed to reach Vercel Domains API: ${err?.message || 'Unknown error'}`,
      });
    }
  }

  // =========================================================================
  // 2. CUSTOM DOMAIN ATTACH / VERIFY / DELETE
  // =========================================================================
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
    if (req.method === 'POST' && action === 'verify') {
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
    return res.status(502).json({
      ok: false,
      domain,
      dns_records: dnsRecords,
      error: `Failed to reach Vercel Domains API: ${err?.message || 'Unknown error'}`,
    });
  }
};
