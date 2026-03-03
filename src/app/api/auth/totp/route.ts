import { NextRequest } from 'next/server';
import speakeasy from 'speakeasy';
import { successResponse, handleErrorResponse } from '@/lib/api-errors';
import { getEnv } from '@/lib/env';
import { checkRateLimit, getRequestIdentifier } from '@/lib/rate-limit';

const TOTP_DIGITS = 6;

export async function POST(req: NextRequest) {
  try {
    const ip = getRequestIdentifier(req);
    const rate = checkRateLimit(`totp:${ip}`, 10, 60_000);
    if (!rate.allowed) {
      return successResponse({ error: 'Too many requests. Please try again later.' }, 429);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return successResponse({ error: 'Invalid JSON body' }, 400);
    }

    const { token } = body as { token?: string };

    if (!token || typeof token !== 'string') {
      return successResponse({ error: 'Token is required' }, 400);
    }

    const env = getEnv();
    if (!env.TOTP_SECRET) {
      return successResponse({ error: 'TOTP is not configured on server' }, 503);
    }

    const verified = speakeasy.totp.verify({
      secret: env.TOTP_SECRET,
      encoding: 'base32',
      token: token,
      digits: TOTP_DIGITS,
      window: 2, // Allow 2 windows of drift
    });

    if (verified) {
      return successResponse({ valid: true });
    } else {
      return successResponse({ valid: false, error: 'Invalid token' }, 401);
    }
  } catch (error) {
    return handleErrorResponse(error);
  }
}
