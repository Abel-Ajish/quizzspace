'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PusherJs from 'pusher-js';
import { Card, Alert } from '@/components/ui';
import { useGame } from '@/contexts/GameContext';

interface Player {
  id: string;
  name: string;
  score: number;
}

interface SessionData {
  id: string;
  joinCode: string;
  status: 'waiting' | 'locked' | 'active' | 'paused' | 'finished';
  currentQuestionIndex: number;
  quiz: {
    id: string;
    title: string;
    questions: Array<{ id: string }>;
  };
  players: Player[];
}

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const { currentPlayer, setGamePhase, reset, setWasRemoved } = useGame();

  const code = params.code as string;

  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [removed, setRemoved] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const sessionEtagRef = useRef<string | null>(null);

  // Poll for session updates
  useEffect(() => {
    if (!currentPlayer) {
      router.push('/');
      return;
    }
    sessionEtagRef.current = null;
    let isPolling = false;

    const fetchSession = async () => {
      if (isPolling) {
        return;
      }

      isPolling = true;
      try {
        const response = await fetch(`/api/session/${code}?mode=lite`, {
          headers: sessionEtagRef.current
            ? { 'If-None-Match': sessionEtagRef.current }
            : undefined,
        });

        if (response.status === 304) {
          setIsReconnecting((prev) => {
            if (prev) {
              setShowReconnected(true);
            }
            return false;
          });
          return;
        }

        if (!response.ok) {
          throw new Error(`Session fetch failed (${response.status})`);
        }

        const nextEtag = response.headers.get('etag');
        if (nextEtag) {
          sessionEtagRef.current = nextEtag;
        }

        const data: SessionData = await response.json();

        setIsReconnecting((prev) => {
          if (prev) {
            setShowReconnected(true);
          }
          return false;
        });

        setSession(data);

        // Check if current player was removed from the session
        const playerStillInSession = data.players.some(
          (p) => p.id === currentPlayer.id
        );
        if (!playerStillInSession) {
          setRemoved(true);
          setWasRemoved(true);
          return; // Stop further processing
        }

        // If game starts or resumes, redirect to game page
        if (data.status === 'active') {
          setGamePhase('question');
          router.push(`/game/${code}`);
        }

        if (data.status === 'finished') {
          setGamePhase('finished');
          router.push(`/results/${code}`);
        }
      } catch (err) {
        console.error('Failed to fetch session:', err);
        setIsReconnecting(true);
      } finally {
        isPolling = false;
        setIsLoading(false);
      }
    };

    fetchSession();

    let pusher: PusherJs | null = null;
    let channel: PusherJs.Channel | null = null;
    if (process.env.NEXT_PUBLIC_PUSHER_KEY) {
      try {
        pusher = new PusherJs(process.env.NEXT_PUBLIC_PUSHER_KEY, {
          cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'mt1',
        });
        channel = pusher.subscribe(`session-${code}`);

        const onSessionEvent = () => {
          fetchSession();
        };

        channel.bind('player_joined', onSessionEvent);
        channel.bind('player_removed', onSessionEvent);
        channel.bind('question_start', onSessionEvent);
        channel.bind('session_paused', onSessionEvent);
        channel.bind('session_resumed', onSessionEvent);
        channel.bind('game_over', onSessionEvent);
      } catch (err) {
        console.error('Failed to initialize lobby realtime updates:', err);
      }
    }

    // Slower fallback polling while realtime handles most updates
    const interval = setInterval(fetchSession, 6000);
    return () => {
      clearInterval(interval);
      if (channel) {
        channel.unbind_all();
      }
      if (pusher) {
        pusher.unsubscribe(`session-${code}`);
        pusher.disconnect();
      }
    };
  }, [code, currentPlayer, router, setGamePhase, setWasRemoved]);

  // Handle removed state — show message then redirect
  useEffect(() => {
    if (removed) {
      const timer = setTimeout(() => {
        reset();
        router.push('/');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [removed, reset, router]);

  useEffect(() => {
    if (!showReconnected) return;

    const timer = setTimeout(() => setShowReconnected(false), 2000);
    return () => clearTimeout(timer);
  }, [showReconnected]);

  if (removed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-red-50 to-pink-100 dark:from-slate-900 dark:to-slate-800 animate-fade-in">
        <Card className="w-full max-w-md shadow-xl animate-scale-in">
          <Alert variant="error">
            <p className="text-lg font-bold">You have been removed</p>
            <p className="text-sm mt-2">The host has removed you from this session. Redirecting to home...</p>
          </Alert>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-50 to-emerald-100 dark:from-slate-900 dark:to-slate-800 animate-fade-in">
        <Card className="w-full max-w-md shadow-xl text-center animate-scale-in">
          <h2 className="text-2xl font-bold mb-6 text-slate-900 dark:text-white animate-slide-up">
            Joining Quiz...
          </h2>
          <div className="space-y-4">
            <div className="h-8 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 rounded animate-pulse"></div>
            <div className="h-6 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 rounded w-3/4 mx-auto animate-pulse"></div>
          </div>
        </Card>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-red-50 to-pink-100 dark:from-slate-900 dark:to-slate-800 animate-fade-in">
        <Card className="w-full max-w-md shadow-xl animate-scale-in">
          <Alert variant="error">
            ❌ Session not found. Please check your join code and try again.
          </Alert>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 dark:from-slate-900 dark:to-slate-800 p-4 flex items-center justify-center animate-fade-in">
      <Card className="w-full max-w-md shadow-xl animate-scale-in">
        <div className="text-center mb-8 animate-slide-down">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            {session.quiz.title}
          </h1>
          <div className="inline-block bg-blue-100 dark:bg-blue-900 px-4 py-2 rounded-lg border-2 border-blue-300 dark:border-blue-700 animate-pulse-glow">
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-300 tracking-widest font-mono">
              {code}
            </p>
          </div>
        </div>

        <div className="mb-8 animate-slide-up">
          {isReconnecting && (
            <Alert variant="warning" className="mb-4">
              🌐 Reconnecting to live session...
            </Alert>
          )}

          {showReconnected && (
            <Alert variant="success" className="mb-4">
              ✅ Reconnected. Session is live again.
            </Alert>
          )}

          <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">
            👋 Welcome, <span className="text-purple-600 dark:text-purple-300">{currentPlayer?.name}</span>!
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 font-medium">
            ⏳ Waiting for the host to start the game...
          </p>

          {session.status === 'locked' && (
            <Alert variant="warning" className="mb-4">
              🔒 Lobby is locked. New players cannot join until host unlocks it.
            </Alert>
          )}

          <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-600 p-4 rounded-lg mb-6 border border-slate-200 dark:border-slate-500 transition-all duration-300">
            <p className="text-sm font-medium text-slate-900 dark:text-white mb-3">
              👥 Players joined (<span className="font-bold text-purple-600 dark:text-purple-300">{session.players.length}</span>):
            </p>
            <ul className="space-y-2">
              {session.players.map((player, index) => (
                <li
                  key={player.id}
                  className="text-sm text-slate-700 dark:text-slate-300 flex items-center p-2 rounded-md hover:bg-white dark:hover:bg-slate-700 transition-all duration-200 opacity-0 animate-[slideUp_0.3s_ease-out_forwards]"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <span className="w-2 h-2 bg-gradient-to-r from-green-400 to-green-500 rounded-full mr-3 animate-pulse"></span>
                  <span className="font-medium">{player.name}</span>
                  {player.id === currentPlayer?.id && (
                    <span className="ml-auto text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full font-semibold">
                      You
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Live indicator */}
          <div className="flex items-center justify-center gap-2 animate-slide-up">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
            <p className="text-sm font-bold text-red-600 dark:text-red-400">
              🔴 LIVE LOBBY
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-slate-700 dark:to-slate-600 p-4 rounded-lg text-center border border-blue-200 dark:border-slate-500 animate-slide-up">
          <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
            📝 Quiz has <span className="font-bold text-blue-600 dark:text-blue-300">{session.quiz.questions.length}</span> questions
          </p>
        </div>
      </Card>
    </div>
  );
}
