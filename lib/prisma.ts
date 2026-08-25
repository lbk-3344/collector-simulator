import { PrismaClient } from "@prisma/client";

// Standard Next.js singleton pattern — avoids exhausting DB connections from a
// new PrismaClient being created on every hot-reload in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
