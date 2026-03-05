import Ably from 'ably';
import { getEnv } from '@/lib/env';

type RealtimePublisher = {
  publish: (channel: string, event: string, data: Record<string, unknown>) => Promise<void>;
};

let ablyRestClient: Ably.Rest | null = null;
let invalidKeyLogged = false;

function getAblyRestClient(): Ably.Rest | null {
  if (ablyRestClient) {
    return ablyRestClient;
  }

  const env = getEnv();
  const rawKey = env.ABLY_API_KEY?.trim();

  if (!rawKey) {
    if (env.NODE_ENV === 'production') {
      console.warn('Ably env var is missing; app will run with polling fallback.');
    }
    return null;
  }

  try {
    ablyRestClient = new Ably.Rest(rawKey);
    return ablyRestClient;
  } catch (error) {
    if (!invalidKeyLogged) {
      console.error('Failed to initialize Ably REST client; falling back to polling.', error);
      invalidKeyLogged = true;
    }
    return null;
  }
}

export const realtime: RealtimePublisher = {
  publish: async (channel, event, data) => {
    const client = getAblyRestClient();
    if (!client) {
      return;
    }

    await client.channels.get(channel).publish(event, data);
  },
};

// Channel naming conventions
export const channelNames = {
  session: (code: string) => `session-${code}`,
  playerSession: (sessionId: string) => `player-${sessionId}`,
};

// Event names
export const eventNames = {
  PLAYER_JOINED: 'player_joined',
  PLAYER_REMOVED: 'player_removed',
  QUESTION_START: 'question_start',
  ANSWER_RECEIVED: 'answer_received',
  LEADERBOARD_UPDATE: 'leaderboard_update',
  GAME_OVER: 'game_over',
  NEXT_QUESTION: 'next_question',
  SESSION_PAUSED: 'session_paused',
  SESSION_RESUMED: 'session_resumed',
  LOBBY_LOCKED: 'lobby_locked',
  LOBBY_UNLOCKED: 'lobby_unlocked',
};

// Helper to send event to session
export async function broadcastToSession(
  code: string,
  event: string,
  data: Record<string, unknown>
) {
  return realtime.publish(channelNames.session(code), event, data);
}

// Helper to send event to specific player
export async function sendToPlayer(
  sessionId: string,
  playerId: string,
  event: string,
  data: Record<string, unknown>
) {
  return realtime.publish(
    `${channelNames.playerSession(sessionId)}-${playerId}`,
    event,
    data
  );
}
