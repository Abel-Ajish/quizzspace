import { NextRequest } from 'next/server';
import { successResponse, handleErrorResponse } from '@/lib/api-errors';
import { getEnv } from '@/lib/env';
import { checkRateLimit, getRequestIdentifier } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const ip = getRequestIdentifier(req);
    const rate = checkRateLimit(`admin-auth:${ip}`, 10, 60_000);
    if (!rate.allowed) {
      return successResponse({ error: 'Too many requests. Please try again later.' }, 429);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return successResponse({ error: 'Invalid JSON body' }, 400);
    }

    const { password } = body as { password?: string };

    if (!password || typeof password !== 'string') {
      return successResponse({ error: 'Password is required' }, 400);
    }

    const env = getEnv();
    if (!env.MASTER_PASSWORD) {
      return successResponse({ error: 'Master password is not configured on server' }, 503);
    }

    const inputPassword = password.trim();
    const configuredPassword = env.MASTER_PASSWORD.trim();

    const verified = inputPassword === configuredPassword;

    if (verified) {
      return successResponse({ valid: true });
    } else {
      return successResponse({ valid: false, error: 'Invalid password' }, 401);
    }
  } catch (error) {
    return handleErrorResponse(error);
  }
}
