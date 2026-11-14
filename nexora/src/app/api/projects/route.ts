import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { createProjectSchema } from '@/lib/schema';
import { failure } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const ownerId = await requireUser(req);
    const projects = await db.project.findMany({ where: { ownerId }, orderBy: { updatedAt: 'desc' }, take: 100, include: { deployments: { take: 1, orderBy: { createdAt: 'desc' } } } });
    return NextResponse.json({ projects });
  } catch (e) { return failure(e); }
}
export async function POST(req: NextRequest) {
  try {
    const ownerId = await requireUser(req);
    const data = createProjectSchema.parse(await req.json());
    const project = await db.project.create({ data: { ...data, ownerId } });
    return NextResponse.json({ project }, { status: 201 });
  } catch (e) { return failure(e); }
}
