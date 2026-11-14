import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure, HttpError, uuidSchema } from '@/lib/http';
import { z } from 'zod';
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUser(req); const id = uuidSchema.parse((await context.params).id);
    const { revisionId } = z.object({ revisionId: uuidSchema }).strict().parse(await req.json());
    await db.$transaction(async tx => {
      const revision = await tx.revision.findFirst({ where: { id: revisionId, projectId: id, status: 'proposed', project: { ownerId } } });
      if (!revision) throw new HttpError(404, 'Proposal not found.');
      const updated = await tx.project.updateMany({ where: { id, ownerId, activeRevisionId: revision.parentRevisionId }, data: { activeRevisionId: revision.id } });
      if (!updated.count) throw new HttpError(409, 'The project changed since this proposal. Generate a new proposal from the current version.');
      await tx.revision.update({ where: { id: revision.id }, data: { status: 'applied' } });
    });
    return NextResponse.json({ applied: true });
  } catch (e) { return failure(e); }
}
