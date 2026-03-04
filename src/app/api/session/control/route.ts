import { NextRequest } from 'next/server';
import { handleErrorResponse, successResponse } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { broadcastToSession, eventNames } from '@/lib/pusher';
import { checkRateLimit, getRequestIdentifier } from '@/lib/rate-limit';
import { acquireLoadSlot } from '@/lib/load-balancer';

export async function POST(req: NextRequest) {
  const slot = acquireLoadSlot('session:control', 60);
  if (!slot.acquired) {
    return successResponse({ error: 'Server is busy. Please retry shortly.' }, 503);
  }

  try {
    const ip = getRequestIdentifier(req);
    const rate = checkRateLimit(`session:control:${ip}`, 120, 60_000);
    if (!rate.allowed) {
      return successResponse({ error: 'Too many requests. Please try again later.' }, 429);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return successResponse({ error: 'Invalid JSON body' }, 400);
    }
    const { action, sessionId } = body as { action?: string; sessionId?: string };

    if (!sessionId) {
      return successResponse({ error: 'sessionId is required' }, 400);
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
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
        players: true,
      },
    });

    if (!session) {
      return successResponse({ error: 'Session not found' }, 404);
    }

    if (action === 'start') {
      if (session.status !== 'waiting' && session.status !== 'locked') {
        return successResponse({ error: 'Session has already been started' }, 400);
      }

      if (session.players.length === 0) {
        return successResponse({ error: 'Cannot start a game with no players' }, 400);
      }

      // Start the game
      const updatedSession = await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'active',
          startedAt: new Date(),
          currentQuestionIndex: 0,
        },
        include: {
          quiz: {
            include: {
              questions: {
                orderBy: { orderIndex: 'asc' },
                include: {
                  choices: {
                    select: { id: true, text: true },
                  },
                },
              },
            },
          },
          players: { orderBy: { score: 'desc' } },
        },
      });

      const currentQuestion = session.quiz.questions[0];

      // Broadcast game start
      await broadcastToSession(session.joinCode, eventNames.QUESTION_START, {
        questionIndex: 0,
        totalQuestions: session.quiz.questions.length,
        question: currentQuestion,
      });

      return successResponse(updatedSession);
    } else if (action === 'pause') {
      if (session.status !== 'active') {
        return successResponse({ error: 'Only active sessions can be paused' }, 400);
      }

      const updatedSession = await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'paused',
        },
      });

      await broadcastToSession(session.joinCode, eventNames.SESSION_PAUSED, {
        sessionId,
        questionIndex: session.currentQuestionIndex,
      });

      return successResponse(updatedSession);
    } else if (action === 'resume') {
      if (session.status !== 'paused') {
        return successResponse({ error: 'Only paused sessions can be resumed' }, 400);
      }

      const updatedSession = await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'active',
        },
      });

      await broadcastToSession(session.joinCode, eventNames.SESSION_RESUMED, {
        sessionId,
        questionIndex: session.currentQuestionIndex,
      });

      return successResponse(updatedSession);
    } else if (action === 'lock') {
      if (session.status !== 'waiting') {
        return successResponse({ error: 'Lobby can only be locked while waiting' }, 400);
      }

      const updatedSession = await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'locked',
        },
      });

      await broadcastToSession(session.joinCode, eventNames.LOBBY_LOCKED, {
        sessionId,
      });

      return successResponse(updatedSession);
    } else if (action === 'unlock') {
      if (session.status !== 'locked') {
        return successResponse({ error: 'Lobby is not locked' }, 400);
      }

      const updatedSession = await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'waiting',
        },
      });

      await broadcastToSession(session.joinCode, eventNames.LOBBY_UNLOCKED, {
        sessionId,
      });

      return successResponse(updatedSession);
    } else if (action === 'next') {
      if (session.status !== 'active') {
        if (session.status === 'paused') {
          return successResponse({ error: 'Resume the session before advancing' }, 400);
        }

        return successResponse({ error: 'Session is not active' }, 400);
      }

      // Move to next question
      const nextIndex = session.currentQuestionIndex + 1;

      if (nextIndex >= session.quiz.questions.length) {
        // Game over
        const updatedSession = await prisma.session.update({
          where: { id: sessionId },
          data: {
            status: 'finished',
            endedAt: new Date(),
          },
        });

        const finalLeaderboard = await prisma.player.findMany({
          where: { sessionId },
          orderBy: { score: 'desc' },
        });

        await broadcastToSession(session.joinCode, eventNames.GAME_OVER, {
          leaderboard: finalLeaderboard,
        });

        return successResponse(updatedSession);
      }

      const updatedSession = await prisma.session.update({
        where: { id: sessionId },
        data: {
          currentQuestionIndex: nextIndex,
        },
        include: {
          quiz: {
            include: {
              questions: {
                orderBy: { orderIndex: 'asc' },
                include: {
                  choices: {
                    select: { id: true, text: true },
                  },
                },
              },
            },
          },
          players: { orderBy: { score: 'desc' } },
        },
      });

      const nextQuestion = session.quiz.questions[nextIndex];

      await broadcastToSession(session.joinCode, eventNames.QUESTION_START, {
        questionIndex: nextIndex,
        totalQuestions: session.quiz.questions.length,
        question: nextQuestion,
      });

      return successResponse(updatedSession);
    }

    return successResponse(
      { error: 'Invalid action. Use "start", "next", "pause", "resume", "lock", or "unlock"' },
      400
    );
  } catch (error) {
    return handleErrorResponse(error);
  } finally {
    if (slot.acquired) {
      slot.release();
    }
  }
}
