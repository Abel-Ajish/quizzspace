import { NextRequest } from 'next/server';
import { handleErrorResponse, successResponse, ApiErrors } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { isValidCode } from '@/lib/game-logic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const mode = req.nextUrl.searchParams.get('mode');

    if (!isValidCode(code)) {
      throw ApiErrors.INVALID_CODE;
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

    return successResponse(session);
  } catch (error) {
    return handleErrorResponse(error);
  }
}
