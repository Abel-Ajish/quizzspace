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

    if (!isValidCode(code)) {
      throw ApiErrors.INVALID_CODE;
    }

    const session = await prisma.session.findUnique({
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
                    isCorrect: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw ApiErrors.INVALID_CODE;
    }

    const currentQuestion = session.quiz.questions[session.currentQuestionIndex];
    if (!currentQuestion) {
      return successResponse({
        questionId: null,
        correctChoiceId: null,
        correctChoiceText: null,
      });
    }

    const correctChoice = currentQuestion.choices.find((choice) => choice.isCorrect);

    return successResponse({
      questionId: currentQuestion.id,
      correctChoiceId: correctChoice?.id ?? null,
      correctChoiceText: correctChoice?.text ?? null,
    });
  } catch (error) {
    return handleErrorResponse(error);
  }
}
