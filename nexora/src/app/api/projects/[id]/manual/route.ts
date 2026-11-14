import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure, HttpError, uuidSchema } from '@/lib/http';
import { fileSchema } from '@/lib/schema';
import { z } from 'zod';
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUser(req); const id = uuidSchema.parse((await context.params).id);
    const { files } = z.object({ files: fileSchema }).strict().parse(await req.json());
    const project = await db.project.findFirst({ where: { id, ownerId } });
    if (!project) throw new HttpError(404, 'Project not found.');
    const revision = await db.revision.create({ data: {
      projectId: id, parentRevisionId: project.activeRevisionId, prompt: 'Manual source edit',
      summary: 'Manual source changes. Review the preview and source before applying.', files,
    } });
    return NextResponse.json({ revision }, { status: 201 });
  } catch (e) { return failure(e); }
}
