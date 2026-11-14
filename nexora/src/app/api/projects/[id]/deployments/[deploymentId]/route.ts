import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure, HttpError, uuidSchema } from '@/lib/http';
import { getVercelDeployment, safeVercelUrl } from '@/lib/vercel';
export async function POST(req: NextRequest, context: { params: Promise<{ id: string; deploymentId: string }> }) {
  try {
    const ownerId = await requireUser(req); const params = await context.params;
    const id = uuidSchema.parse(params.id); const deploymentId = uuidSchema.parse(params.deploymentId);
    const deployment = await db.deployment.findFirst({ where: { id: deploymentId, projectId: id, project: { ownerId } } });
    if (!deployment) throw new HttpError(404, 'Deployment not found.');
    const remote = await getVercelDeployment(deployment.providerId);
    const status = typeof remote.readyState === 'string' ? remote.readyState : 'UNKNOWN';
    const updated = await db.deployment.update({ where: { id: deployment.id }, data: { status, url: status === 'READY' ? safeVercelUrl(remote.url) : null } });
    return NextResponse.json({ deployment: updated });
  } catch (e) { return failure(e); }
}
