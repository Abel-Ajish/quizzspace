import { NextRequest, NextResponse } from 'next/server';
import { handleErrorResponse, successResponse } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const quiz = await prisma.quiz.findUnique({
      where: { id },
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
    });

    if (!quiz) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    return successResponse(quiz);
  } catch (error) {
    return handleErrorResponse(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.quiz.delete({
      where: { id },
    });

    return successResponse({ message: 'Quiz deleted successfully' });
  } catch (error) {
    return handleErrorResponse(error);
  }
}
