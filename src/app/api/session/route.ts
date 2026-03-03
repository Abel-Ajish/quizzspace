import { NextRequest } from 'next/server';
import { CreateSessionSchema } from '@/lib/validations';
import { handleErrorResponse, successResponse, ApiErrors } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { generateJoinCode } from '@/lib/game-logic';
import { checkRateLimit, getRequestIdentifier } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const ip = getRequestIdentifier(req);
    const rate = checkRateLimit(`session:create:${ip}`, 30, 60_000);
    if (!rate.allowed) {
      return successResponse({ error: 'Too many requests. Please try again later.' }, 429);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return successResponse({ error: 'Invalid JSON body' }, 400);
    }
    const validatedData = CreateSessionSchema.parse(body);

    // Verify quiz exists
    const quiz = await prisma.quiz.findUnique({
      where: { id: validatedData.quizId },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!quiz) {
      throw ApiErrors.QUIZ_NOT_FOUND;
    }

    // Generate unique join code
    let joinCode: string = '';
    let isUnique = false;
    while (!isUnique) {
      joinCode = generateJoinCode();
      const existing = await prisma.session.findUnique({
        where: { joinCode },
      });
      isUnique = !existing;
    }

    // Create session
    const session = await prisma.session.create({
      data: {
        quizId: validatedData.quizId,
        joinCode: joinCode,
        status: 'waiting',
        currentQuestionIndex: 0,
      },
      include: {
        quiz: {
          include: {
            questions: {
              orderBy: { orderIndex: 'asc' },
              include: { choices: true },
            },
          },
        },
        players: true,
      },
    });

    return successResponse(session, 201);
  } catch (error) {
    return handleErrorResponse(error);
  }
}
