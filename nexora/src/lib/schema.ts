import { z } from 'zod';

export const fileSchema = z.object({
  'index.html': z.string().min(1).max(150_000),
  'styles.css': z.string().max(100_000),
  'app.js': z.string().max(100_000),
}).strict();
export type WebsiteFiles = z.infer<typeof fileSchema>;
export const generatedSchema = z.object({
  summary: z.string().min(1).max(1200),
  files: fileSchema,
}).strict();
export const promptSchema = z.object({ prompt: z.string().trim().min(3).max(4000) }).strict();
export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
}).strict();
