import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const globalDb = globalThis as unknown as { nexoraPrisma?: PrismaClient };
// The database URL stays on the server. A generated project's code never runs here.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || '' });
export const db = globalDb.nexoraPrisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== 'production') globalDb.nexoraPrisma = db;
