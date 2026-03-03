import { successResponse, handleErrorResponse } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { getEnv } from '@/lib/env';

export async function GET() {
  try {
    const env = getEnv();

    await prisma.$queryRaw`SELECT 1`;

    const pusherConfigured = Boolean(
      env.PUSHER_APP_ID &&
        env.NEXT_PUBLIC_PUSHER_KEY &&
        env.PUSHER_SECRET &&
        env.NEXT_PUBLIC_PUSHER_CLUSTER
    );

    return successResponse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok',
        pusher: pusherConfigured ? 'configured' : 'polling-fallback',
        totp: env.TOTP_SECRET ? 'configured' : 'not-configured',
      },
    });
  } catch (error) {
    return handleErrorResponse(error);
  }
}
