import Pusher from 'pusher';
import { getEnv } from '@/lib/env';

// Create Pusher instance if credentials are available, otherwise mock it
let pusherInstance: Pusher | null = null;

const env = getEnv();

if (
  env.PUSHER_APP_ID &&
  env.NEXT_PUBLIC_PUSHER_KEY &&
  env.PUSHER_SECRET &&
  env.NEXT_PUBLIC_PUSHER_CLUSTER
) {
  pusherInstance = new Pusher({
    appId: env.PUSHER_APP_ID,
    key: env.NEXT_PUBLIC_PUSHER_KEY,
    secret: env.PUSHER_SECRET,
    cluster: env.NEXT_PUBLIC_PUSHER_CLUSTER,
    useTLS: true,
  });
} else if (env.NODE_ENV === 'production') {
  console.warn('Pusher env vars are missing; app will run with polling fallback.');
}

// Export a mock/real pusher instance
export const pusher = pusherInstance || {
  trigger: async () => ({ ok: true }),
  subscribe: async () => ({}),
  unsubscribe: async () => ({}),
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
};

// Helper to send event to session
export async function broadcastToSession(
  code: string,
  event: string,
  data: Record<string, unknown>
) {
  return pusher.trigger(channelNames.session(code), event, data);
}

// Helper to send event to specific player
export async function sendToPlayer(
  sessionId: string,
  playerId: string,
  event: string,
  data: Record<string, unknown>
) {
  return pusher.trigger(
    `${channelNames.playerSession(sessionId)}-${playerId}`,
    event,
    data
  );
}
