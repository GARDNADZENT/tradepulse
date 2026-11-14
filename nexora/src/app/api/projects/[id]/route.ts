import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure, HttpError, uuidSchema } from '@/lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, context: Context) {
  try {
    const ownerId = await requireUser(req); const id = uuidSchema.parse((await context.params).id);
    const project = await db.project.findFirst({ where: { id, ownerId }, include: {
      revisions: { orderBy: { createdAt: 'desc' }, take: 30 },
      deployments: { orderBy: { createdAt: 'desc' }, take: 10 },
    } });
    if (!project) throw new HttpError(404, 'Project not found.');
    // Always return the active version, even if newer proposals exceed the history window.
    if (project.activeRevisionId && !project.revisions.some(r => r.id === project.activeRevisionId)) {
      const active = await db.revision.findFirst({ where: { id: project.activeRevisionId, projectId: id } });
      if (active) project.revisions.push(active);
    }
    return NextResponse.json({ project });
  } catch (e) { return failure(e); }
}
export async function DELETE(req: NextRequest, context: Context) {
  try {
    const ownerId = await requireUser(req); const id = uuidSchema.parse((await context.params).id);
    const result = await db.project.deleteMany({ where: { id, ownerId } });
    if (!result.count) throw new HttpError(404, 'Project not found.');
    // Deleting a project does not delete any already published Vercel deployment.
    return NextResponse.json({ deleted: true });
  } catch (e) { return failure(e); }
}
