import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { handleErrorResponse, successResponse, ApiErrors } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { isValidCode } from '@/lib/game-logic';
import { acquireLoadSlot } from '@/lib/load-balancer';

type CachedSession = {
  data: unknown;
  etag: string;
  expiresAt: number;
};

const liteSessionCache = new Map<string, CachedSession>();
const LITE_CACHE_TTL_MS = 1200;

function buildEtag(data: unknown): string {
  const hash = createHash('sha1').update(JSON.stringify(data)).digest('hex');
  return `W/"${hash}"`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const slot = acquireLoadSlot('session:get', 120);
  if (!slot.acquired) {
    return NextResponse.json(
      {
        error: 'Server is busy. Please retry shortly.',
      },
      {
        status: 503,
        headers: {
          'Retry-After': '1',
        },
      }
    );
  }

  try {
    const { code } = await params;
    const mode = req.nextUrl.searchParams.get('mode');
    const ifNoneMatch = req.headers.get('if-none-match');

    if (!isValidCode(code)) {
      throw ApiErrors.INVALID_CODE;
    }

    if (mode === 'lite') {
      const cacheKey = `${code}:lite`;
      const cached = liteSessionCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        if (ifNoneMatch && ifNoneMatch === cached.etag) {
          return new NextResponse(null, {
            status: 304,
            headers: {
              ETag: cached.etag,
              'Cache-Control': 'private, no-cache',
            },
          });
        }

        return NextResponse.json(cached.data, {
          status: 200,
          headers: {
            ETag: cached.etag,
            'Cache-Control': 'private, no-cache',
          },
        });
      }
    }

    const session = mode === 'lite'
      ? await prisma.session.findUnique({
          where: { joinCode: code },
          select: {
            id: true,
            joinCode: true,
            status: true,
            currentQuestionIndex: true,
            createdAt: true,
            updatedAt: true,
            startedAt: true,
            endedAt: true,
            quiz: {
              select: {
                id: true,
                title: true,
                questions: {
                  orderBy: { orderIndex: 'asc' },
                  select: {
                    id: true,
                  },
                },
              },
            },
            players: {
              orderBy: { score: 'desc' },
              select: {
                id: true,
                name: true,
                score: true,
              },
            },
          },
        })
      : await prisma.session.findUnique({
          where: { joinCode: code },
          include: {
            quiz: {
              include: {
                questions: {
                  orderBy: { orderIndex: 'asc' },
                  include: {
                    choices: {
                      select: {
                        id: true,
                        text: true,
                      },
                    },
                  },
                },
              },
            },
            players: {
              orderBy: { score: 'desc' },
            },
          },
        });

    if (!session) {
      throw ApiErrors.INVALID_CODE;
    }

    const etag = buildEtag(session);

    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'private, no-cache',
        },
      });
    }

    if (mode === 'lite') {
      const cacheKey = `${code}:lite`;
      liteSessionCache.set(cacheKey, {
        data: session,
        etag,
        expiresAt: Date.now() + LITE_CACHE_TTL_MS,
      });

      if (liteSessionCache.size > 250) {
        const now = Date.now();
        for (const [key, value] of liteSessionCache.entries()) {
          if (value.expiresAt <= now) {
            liteSessionCache.delete(key);
          }
        }
      }
    }

    return NextResponse.json(session, {
      status: 200,
      headers: {
        ETag: etag,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (error) {
    return handleErrorResponse(error);
  } finally {
    if (slot.acquired) {
      slot.release();
    }
  }
}
