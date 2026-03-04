'use client';

import { useEffect, useRef } from 'react';
import PusherJs from 'pusher-js';
import { useGame } from './GameContext';

type PlayerRemovedEvent = {
  playerId?: string;
};

export function PusherProvider({ children }: { children: React.ReactNode }) {
  const pusherRef = useRef<PusherJs | null>(null);
  const pendingRefreshTimeoutRef = useRef<number | null>(null);
  const sessionEtagRef = useRef<string | null>(null);
  const { session, setSession, setGamePhase, isHost } = useGame();

  useEffect(() => {
    // Only initialize Pusher if key is available
    if (!pusherRef.current && typeof window !== 'undefined' && process.env.NEXT_PUBLIC_PUSHER_KEY) {
      try {
        pusherRef.current = new PusherJs(
          process.env.NEXT_PUBLIC_PUSHER_KEY,
          {
            cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'mt1',
          }
        );
      } catch (err) {
        console.error('Failed to initialize Pusher:', err);
        pusherRef.current = null;
      }
    }

    return () => {
      // Cleanup subscriptions when component unmounts or session changes
      if (pusherRef.current && session) {
        const channel = pusherRef.current.channel(`session-${session.joinCode}`);
        if (channel) {
          pusherRef.current.unsubscribe(`session-${session.joinCode}`);
        }
      }
    };
  }, [session]);

  // Subscribe to session channel when session is available
  useEffect(() => {
    if (!pusherRef.current || !session) return;
    sessionEtagRef.current = null;

    try {
      const channel = pusherRef.current.subscribe(`session-${session.joinCode}`);

      // Fetch updated session data from API
      const fetchUpdatedSession = async () => {
        try {
          const response = await fetch(`/api/session/${session.joinCode}`, {
            headers: sessionEtagRef.current
              ? { 'If-None-Match': sessionEtagRef.current }
              : undefined,
          });

          if (response.status === 304) {
            return;
          }

          if (!response.ok) {
            throw new Error(`Session refresh failed (${response.status})`);
          }

          const nextEtag = response.headers.get('etag');
          if (nextEtag) {
            sessionEtagRef.current = nextEtag;
          }

          const updatedSession = await response.json();
          setSession(updatedSession);
        } catch (err) {
          console.error('Failed to fetch updated session:', err);
        }
      };

      const scheduleSessionRefresh = () => {
        if (pendingRefreshTimeoutRef.current !== null) {
          window.clearTimeout(pendingRefreshTimeoutRef.current);
        }

        pendingRefreshTimeoutRef.current = window.setTimeout(() => {
          pendingRefreshTimeoutRef.current = null;
          fetchUpdatedSession();
        }, 150);
      };

      // Real-time event listeners
      channel.bind('player_joined', (data: unknown) => {
        console.log('Player joined:', data);
        scheduleSessionRefresh();
      });

      channel.bind('player_removed', (data: PlayerRemovedEvent) => {
        console.log('Player removed:', data);
        scheduleSessionRefresh();
        // If current player was removed, redirect to home
        if (data.playerId === sessionStorage.getItem('currentPlayerId')) {
          alert('You have been removed from the session by the host.');
          window.location.href = '/';
        }
      });

      channel.bind('question_start', (data: unknown) => {
        console.log('Question started:', data);
        scheduleSessionRefresh();
        if (isHost) {
          setGamePhase('question');
        }
      });

      channel.bind('leaderboard_update', (data: unknown) => {
        console.log('Leaderboard updated:', data);
        scheduleSessionRefresh();
        if (isHost) {
          setGamePhase('leaderboard');
        }
      });

      channel.bind('game_over', (data: unknown) => {
        console.log('Game over:', data);
        scheduleSessionRefresh();
        if (isHost) {
          setGamePhase('finished');
        }
      });

      return () => {
        if (pendingRefreshTimeoutRef.current !== null) {
          window.clearTimeout(pendingRefreshTimeoutRef.current);
          pendingRefreshTimeoutRef.current = null;
        }
        channel.unbind_all();
      };
    } catch (err) {
      console.error('Failed to subscribe to Pusher channel:', err);
      // Continue without Pusher - polling will handle updates
    }
  }, [session, setSession, setGamePhase, isHost]);

  // In a production app, you'd pass pusherRef.current through context
  // For MVP, we're relying on polling for now
  return <>{children}</>;
}
