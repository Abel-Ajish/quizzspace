import { NextRequest, NextResponse } from 'next/server';
import { CreateQuizSchema } from '@/lib/validations';
import { handleErrorResponse, successResponse } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { validateQuestionChoices } from '@/lib/game-logic';
import { checkRateLimit, getRequestIdentifier } from '@/lib/rate-limit';

export async function GET() {
  try {
    const quizzes = await prisma.quiz.findMany({
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
          include: { choices: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(quizzes);
  } catch (error) {
    return handleErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getRequestIdentifier(req);
    const rate = checkRateLimit(`quiz:create:${ip}`, 20, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const validatedData = CreateQuizSchema.parse(body);

    // Validate that each question has exactly one correct choice
    for (const question of validatedData.questions) {
      if (!validateQuestionChoices(question.choices)) {
        return NextResponse.json(
          {
            error: 'Each question must have exactly one correct answer',
          },
          { status: 400 }
        );
      }
    }

    // Create quiz with questions and choices
    const quiz = await prisma.quiz.create({
      data: {
        title: validatedData.title,
        questions: {
          create: validatedData.questions.map((q, index) => ({
            text: q.text,
            timerSeconds: q.timerSeconds,
            orderIndex: index,
            choices: {
              create: q.choices.map((choice) => ({
                text: choice.text,
                isCorrect: choice.isCorrect,
              })),
            },
          })),
        },
      },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
          include: { choices: true },
        },
      },
    });

    return successResponse(quiz, 201);
  } catch (error) {
    return handleErrorResponse(error);
  }
}
