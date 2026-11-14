import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fileSchema } from '@/lib/schema';
import { failure, HttpError, uuidSchema } from '@/lib/http';
import { createStaticDeployment, safeVercelUrl } from '@/lib/vercel';
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUser(req); const id = uuidSchema.parse((await context.params).id);
    const project = await db.project.findFirst({ where: { id, ownerId } });
    if (!project) throw new HttpError(404, 'Project not found.');
    if (!project.activeRevisionId) throw new HttpError(400, 'Apply a revision before publishing.');
    const revision = await db.revision.findFirst({ where: { id: project.activeRevisionId, projectId: id, status: 'applied' } });
    if (!revision) throw new HttpError(409, 'Applied revision not found.');
    const remote = await createStaticDeployment(id, fileSchema.parse(revision.files));
    if (typeof remote.id !== 'string' || !/^dpl_[a-zA-Z0-9]+$/.test(remote.id)) throw new HttpError(502, 'Vercel returned an invalid deployment response.');
    const status = typeof remote.readyState === 'string' ? remote.readyState : 'QUEUED';
    const deployment = await db.deployment.create({ data: { projectId: id, revisionId: revision.id, providerId: remote.id, status, url: status === 'READY' ? safeVercelUrl(remote.url) : null } });
    return NextResponse.json({ deployment }, { status: 202 });
  } catch (e) { return failure(e); }
}
