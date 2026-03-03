import { NextRequest } from 'next/server';
import { JoinSessionSchema } from '@/lib/validations';
import { handleErrorResponse, successResponse, ApiErrors } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { isValidCode } from '@/lib/game-logic';
import { broadcastToSession, eventNames } from '@/lib/pusher';
import { checkRateLimit, getRequestIdentifier } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const ip = getRequestIdentifier(req);
    const rate = checkRateLimit(`player:join:${ip}`, 60, 60_000);
    if (!rate.allowed) {
      return successResponse({ error: 'Too many requests. Please try again later.' }, 429);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return successResponse({ error: 'Invalid JSON body' }, 400);
    }
    const validatedData = JoinSessionSchema.parse(body);

    if (!isValidCode(validatedData.code)) {
      throw ApiErrors.INVALID_CODE;
    }

    // Find session
    const session = await prisma.session.findUnique({
      where: { joinCode: validatedData.code },
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
      throw ApiErrors.INVALID_CODE;
    }

    if (session.status !== 'waiting') {
      throw ApiErrors.SESSION_NOT_ACTIVE;
    }

    const duplicateName = session.players.find(
      (player) => player.name.trim().toLowerCase() === validatedData.playerName.trim().toLowerCase()
    );

    if (duplicateName) {
      return successResponse({ error: 'Player name is already taken in this session' }, 409);
    }

    // Create player
    const player = await prisma.player.create({
      data: {
        sessionId: session.id,
        name: validatedData.playerName,
        score: 0,
      },
    });

    // Broadcast player joined event
    await broadcastToSession(validatedData.code, eventNames.PLAYER_JOINED, {
      playerId: player.id,
      playerName: player.name,
      totalPlayers: session.players.length + 1,
    });

    return successResponse(
      {
        player,
        session: {
          id: session.id,
          joinCode: session.joinCode,
          status: session.status,
          currentQuestionIndex: session.currentQuestionIndex,
          quiz: session.quiz,
        },
      },
      201
    );
  } catch (error) {
    return handleErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ip = getRequestIdentifier(req);
    const rate = checkRateLimit(`player:remove:${ip}`, 120, 60_000);
    if (!rate.allowed) {
      return successResponse({ error: 'Too many requests. Please try again later.' }, 429);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return successResponse({ error: 'Invalid JSON body' }, 400);
    }
    const { playerId, sessionId } = body as { playerId?: string; sessionId?: string };

    if (!playerId || !sessionId) {
      return successResponse({ error: 'playerId and sessionId are required' }, 400);
    }

    // Find the player first
    const player = await prisma.player.findUnique({
      where: { id: playerId },
    });

    if (!player || player.sessionId !== sessionId) {
      return successResponse({ error: 'Player not found' }, 404);
    }

    // Get the session details before deleting the player
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return successResponse({ error: 'Session not found' }, 404);
    }

    // Delete the player
    await prisma.player.delete({
      where: { id: playerId },
    });

    // Broadcast player removed event
    try {
      await broadcastToSession(session.joinCode, eventNames.PLAYER_REMOVED, {
        playerId: playerId,
        playerName: player.name,
      });
    } catch (broadcastError) {
      console.error('Failed to broadcast player removal:', broadcastError);
      // Continue even if broadcast fails
    }

    // Fetch updated session with players
    const updatedSession = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { players: true },
    });

    return successResponse(
      {
        message: 'Player removed successfully',
        session: updatedSession,
      },
      200
    );
  } catch (error) {
    console.error('Delete player error:', error);
    return handleErrorResponse(error);
  }
}
