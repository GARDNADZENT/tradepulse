import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const uuidSchema = z.string().uuid();
export function failure(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  return NextResponse.json({ error: 'Request failed. Check the server configuration and try again.' }, { status: 500 });
}
export function assertConfigured(...names: string[]) {
  if (names.some(name => !process.env[name])) throw new HttpError(503, 'This integration is not configured on the server.');
}
