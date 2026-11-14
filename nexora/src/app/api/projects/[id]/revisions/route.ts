import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure, HttpError, uuidSchema } from '@/lib/http';
import { fileSchema, promptSchema } from '@/lib/schema';
import { proposeWebsite } from '@/lib/ai';
export const maxDuration = 120;
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUser(req); const id = uuidSchema.parse((await context.params).id);
    const { prompt } = promptSchema.parse(await req.json());
    const project = await db.project.findFirst({ where: { id, ownerId } });
    if (!project) throw new HttpError(404, 'Project not found.');
    const active = project.activeRevisionId ? await db.revision.findFirst({ where: { id: project.activeRevisionId, projectId: id } }) : null;
    if (project.activeRevisionId && !active) throw new HttpError(409, 'Current revision not found.');
    const proposal = await proposeWebsite(prompt, active ? fileSchema.parse(active.files) : null);
    const revision = await db.revision.create({ data: {
      projectId: id, parentRevisionId: project.activeRevisionId, prompt,
      summary: proposal.summary, files: proposal.files,
    } });
    return NextResponse.json({ revision }, { status: 201 });
  } catch (e) { return failure(e); }
}
