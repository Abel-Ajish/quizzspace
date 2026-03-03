import { NextRequest } from 'next/server';
import { SubmitAnswerSchema } from '@/lib/validations';
import { handleErrorResponse, successResponse } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { calculatePoints } from '@/lib/game-logic';
import { broadcastToSession, eventNames } from '@/lib/pusher';
import { checkRateLimit, getRequestIdentifier } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const ip = getRequestIdentifier(req);
    const rate = checkRateLimit(`answer:submit:${ip}`, 300, 60_000);
    if (!rate.allowed) {
      return successResponse({ error: 'Too many requests. Please try again later.' }, 429);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return successResponse({ error: 'Invalid JSON body' }, 400);
    }
    const validatedData = SubmitAnswerSchema.parse(body);

    // Get the session
    const session = await prisma.session.findUnique({
      where: { id: validatedData.sessionId },
      include: {
        quiz: true,
        players: true,
      },
    });

    if (!session) {
      return successResponse({ error: 'Session not found' }, 404);
    }

    if (session.status !== 'active') {
      return successResponse({ error: 'Session is not active' }, 400);
    }

    // Verify the player still exists in this session (may have been removed)
    const player = await prisma.player.findUnique({
      where: { id: validatedData.playerId },
    });

    if (!player || player.sessionId !== session.id) {
      return successResponse({ error: 'Player not found in this session' }, 403);
    }

    // Check for duplicate answer (same player + question)
    const existingAnswer = await prisma.answer.findFirst({
      where: {
        playerId: validatedData.playerId,
        questionId: validatedData.questionId,
        sessionId: validatedData.sessionId,
      },
    });

    if (existingAnswer) {
      return successResponse({ error: 'Answer already submitted for this question' }, 409);
    }

    // Get the question and selected choice
    const [question, selectedChoice] = await Promise.all([
      prisma.question.findUnique({
        where: { id: validatedData.questionId },
      }),
      prisma.choice.findUnique({
        where: { id: validatedData.selectedChoiceId },
      }),
    ]);

    if (!question || !selectedChoice) {
      return successResponse({ error: 'Invalid question or choice' }, 400);
    }

    if (question.quizId !== session.quizId) {
      return successResponse({ error: 'Question does not belong to this session quiz' }, 400);
    }

    if (selectedChoice.questionId !== question.id) {
      return successResponse({ error: 'Selected choice does not belong to question' }, 400);
    }

    // Determine if answer is correct
    const isCorrect = selectedChoice.isCorrect;

    // Calculate points
    const pointsAwarded = calculatePoints(
      isCorrect,
      validatedData.timeTaken,
      question.timerSeconds
    );

    // Create answer record
    const answer = await prisma.answer.create({
      data: {
        playerId: validatedData.playerId,
        questionId: validatedData.questionId,
        selectedChoiceId: validatedData.selectedChoiceId,
        timeTaken: validatedData.timeTaken,
        isCorrect,
        pointsAwarded,
        sessionId: validatedData.sessionId,
      },
    });

    // Update player score
    await prisma.player.update({
      where: { id: validatedData.playerId },
      data: {
        score: {
          increment: pointsAwarded,
        },
      },
    });

    // Get updated leaderboard
    const updatedPlayers = await prisma.player.findMany({
      where: { sessionId: validatedData.sessionId },
      orderBy: { score: 'desc' },
    });

    // Broadcast leaderboard update
    await broadcastToSession(session.joinCode, eventNames.LEADERBOARD_UPDATE, {
      leaderboard: updatedPlayers,
      answerResult: {
        playerId: validatedData.playerId,
        isCorrect,
        pointsAwarded,
      },
    });

    return successResponse(
      {
        answer,
        playerScore: updatedPlayers.find((p) => p.id === validatedData.playerId)
          ?.score,
      },
      201
    );
  } catch (error) {
    return handleErrorResponse(error);
  }
}
