'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PusherJs from 'pusher-js';
import { Button, Card, Alert } from '@/components/ui';
import { useGame } from '@/contexts/GameContext';

interface QuizData {
  id: string;
  title: string;
  questions: Question[];
  createdAt: string;
}

interface Question {
  id: string;
  text: string;
  timerSeconds: number;
  choices: Choice[];
}

interface Choice {
  id: string;
  text: string;
}

interface SessionData {
  id: string;
  joinCode: string;
  status: 'waiting' | 'locked' | 'active' | 'paused' | 'finished';
  currentQuestionIndex: number;
  players: Player[];
}

interface Player {
  id: string;
  name: string;
  score: number;
}

export default function HostDashboard() {
  const params = useParams();
  const router = useRouter();
  const { setSession, setIsHost, setGamePhase } = useGame();

  const quizId = params.quizId as string;

  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [session, setSessionData] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [sessionCreated, setSessionCreated] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const sessionEtagRef = useRef<string | null>(null);
  const joinCode = session?.joinCode;
  const joinLink = typeof window !== 'undefined' && joinCode
    ? `${window.location.origin}/join?code=${joinCode}`
    : '';

  const handleCopyLink = async () => {
    if (!joinLink) return;
    try {
      await navigator.clipboard.writeText(joinLink);
      setShareStatus('Join link copied!');
      setTimeout(() => setShareStatus(''), 2000);
    } catch {
      setShareStatus('Could not copy link. Please copy it manually.');
      setTimeout(() => setShareStatus(''), 3000);
    }
  };

  const handleShareLink = async () => {
    if (!joinLink) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: quiz?.title || 'Join my quiz',
          text: 'Join my quiz lobby using this link:',
          url: joinLink,
        });
        return;
      }

      await handleCopyLink();
    } catch {
      // Ignore cancelled share dialog
    }
  };

  // Poll for session updates
  useEffect(() => {
    if (!joinCode) return;
    sessionEtagRef.current = null;
    let isPolling = false;
    let stopped = false;
    let pollDelayMs = 6000;

    const MIN_POLL_DELAY_MS = 6000;
    const MAX_POLL_DELAY_MS = 30000;
    const POLL_BACKOFF_MULTIPLIER = 1.8;

    let pollTimeout: ReturnType<typeof setTimeout> | null = null;

    const fetchSession = async () => {
      if (isPolling) return;

      isPolling = true;
      try {
        const response = await fetch(`/api/session/${joinCode}?mode=lite`, {
          headers: sessionEtagRef.current
            ? { 'If-None-Match': sessionEtagRef.current }
            : undefined,
        });

        if (response.status === 304) {
          pollDelayMs = MIN_POLL_DELAY_MS;
          return;
        }

        if (!response.ok) {
          const retryAfterHeader = response.headers.get('retry-after');
          const retryAfterMs = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) * 1000 : 0;
          if (retryAfterMs > 0) {
            pollDelayMs = Math.max(pollDelayMs, retryAfterMs);
          }
          throw new Error(`Session fetch failed (${response.status})`);
        }

        pollDelayMs = MIN_POLL_DELAY_MS;

        const nextEtag = response.headers.get('etag');
        if (nextEtag) {
          sessionEtagRef.current = nextEtag;
        }

        const updatedSession = await response.json();
        setSessionData(updatedSession);
      } catch (err) {
        console.error('Failed to poll session:', err);
        pollDelayMs = Math.min(
          MAX_POLL_DELAY_MS,
          Math.round(pollDelayMs * POLL_BACKOFF_MULTIPLIER)
        );
      } finally {
        isPolling = false;
      }
    };

    const scheduleNextPoll = () => {
      if (stopped) return;

      pollTimeout = setTimeout(async () => {
        await fetchSession();
        scheduleNextPoll();
      }, pollDelayMs);
    };

    fetchSession();

    let pusher: PusherJs | null = null;
    let channel: ReturnType<InstanceType<typeof PusherJs>['subscribe']> | null = null;
    if (process.env.NEXT_PUBLIC_PUSHER_KEY) {
      try {
        pusher = new PusherJs(process.env.NEXT_PUBLIC_PUSHER_KEY, {
          cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'mt1',
        });
        channel = pusher.subscribe(`session-${joinCode}`);

        const onSessionEvent = () => {
          fetchSession();
        };

        channel.bind('player_joined', onSessionEvent);
        channel.bind('player_removed', onSessionEvent);
        channel.bind('question_start', onSessionEvent);
        channel.bind('session_paused', onSessionEvent);
        channel.bind('session_resumed', onSessionEvent);
        channel.bind('lobby_locked', onSessionEvent);
        channel.bind('lobby_unlocked', onSessionEvent);
        channel.bind('game_over', onSessionEvent);
      } catch (err) {
        console.error('Failed to initialize host realtime updates:', err);
      }
    }

    scheduleNextPoll();

    return () => {
      stopped = true;
      if (pollTimeout) {
        clearTimeout(pollTimeout);
      }
      if (channel) {
        channel.unbind_all();
      }
      if (pusher) {
        pusher.unsubscribe(`session-${joinCode}`);
        pusher.disconnect();
      }
    };
  }, [joinCode]);

  // Fetch quiz data
  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        const response = await fetch(`/api/quiz/${quizId}`);
        if (!response.ok) throw new Error('Quiz not found');
        const data = await response.json();
        setQuiz(data);
      } catch (err) {
        setError('Failed to load quiz');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuiz();
  }, [quizId]);

  const handleCreateSession = async () => {
    if (!quiz) return;

    setIsStarting(true);
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: quiz.id }),
      });

      if (!response.ok) throw new Error('Failed to create session');

      const newSession = await response.json();
      setSessionData(newSession);
      setSessionCreated(true);
      setIsHost(true);
      // Also set in GameContext so Pusher and game page can access it
      setSession(newSession);
    } catch (err) {
      setError('Failed to create session. Please try again.');
      console.error(err);
    } finally {
      setIsStarting(false);
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    if (!session) return;

    try {
      const response = await fetch('/api/player', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          sessionId: session.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove player');
      }

      const data = await response.json();
      if (data.session) {
        setSessionData(data.session);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to remove player';
      setError(`Error: ${errorMsg}`);
      console.error('Remove player error:', err);
      // Clear error after 3 seconds
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleStartGame = async () => {
    if (!session) return;

    setIsStarting(true);
    setError('');
    try {
      const response = await fetch('/api/session/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          sessionId: session.id,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to start game');
      }

      const updatedSession = await response.json();
      setSessionData(updatedSession);
      setSession(updatedSession); // Update GameContext
      setGamePhase('question');
      router.push(`/game/${session.joinCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start game. Please try again.');
      console.error(err);
    } finally {
      setIsStarting(false);
    }
  };

  const handleSessionAction = async (action: 'lock' | 'unlock') => {
    if (!session) return;

    setActiveAction(action);
    setError('');
    try {
      const response = await fetch('/api/session/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          sessionId: session.id,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Failed to ${action} lobby`);
      }

      setSessionData(data);
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} lobby`);
      console.error(err);
    } finally {
      setActiveAction(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg text-slate-600">Loading quiz...</p>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Alert variant="error">
          <p className="font-semibold">Quiz not found</p>
          <button
            onClick={() => router.push('/')}
            className="mt-2 text-blue-600 hover:underline"
          >
            Return home
          </button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => router.push('/')}
          className="mb-6 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
        >
          ← Back to Home
        </button>

        <Card className="shadow-xl mb-6">
          <h1 className="text-3xl font-bold mb-2 text-slate-900 dark:text-white">
            {quiz.title}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            {quiz.questions.length} questions • Host Dashboard
          </p>

          {error && (
            <Alert variant="error" className="mb-6">
              {error}
            </Alert>
          )}

          {!sessionCreated ? (
            <div>
              <h2 className="text-lg font-semibold mb-4">Get Started</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                Create a session to allow players to join with a join code.
              </p>

              <div className="bg-blue-50 dark:bg-slate-700 p-4 rounded-lg mb-6">
                <h3 className="font-semibold mb-2 text-slate-900 dark:text-white">
                  How it works:
                </h3>
                <ol className="text-sm space-y-1 text-slate-700 dark:text-slate-300">
                  <li>1. Create a session (generates a unique join code)</li>
                  <li>2. Share the code with players</li>
                  <li>3. Start when ready, then guide through questions</li>
                  <li>4. View live leaderboard during the game</li>
                </ol>
              </div>

              <Button
                variant="primary"
                size="lg"
                className="w-full"
                isLoading={isStarting}
                onClick={handleCreateSession}
              >
                Create Session
              </Button>
            </div>
          ) : (
            <div>
              <div className="bg-green-50 dark:bg-slate-700 p-4 rounded-lg mb-6 border-l-4 border-green-500">
                <h3 className="font-semibold mb-2 text-slate-900 dark:text-white">
                  Session Created!
                </h3>
                <p className="text-sm mb-3 text-slate-700 dark:text-slate-300">
                  Share this code with your players:
                </p>
                <div className="bg-white dark:bg-slate-800 p-4 rounded text-3xl font-bold text-center tracking-widest text-blue-600 dark:text-blue-400 mb-4">
                  {session?.joinCode}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Players joined: <span className="font-bold">{session?.players?.length ?? 0}</span>
                </p>

                {joinLink && (
                  <div className="mt-4 p-3 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                      Share this direct join link (players only enter name):
                    </p>
                    <p className="text-xs break-all text-blue-700 dark:text-blue-300 mb-3">
                      {joinLink}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={handleCopyLink}>
                        Copy Link
                      </Button>
                      <Button variant="secondary" size="sm" className="flex-1" onClick={handleShareLink}>
                        Share Link
                      </Button>
                    </div>
                    {shareStatus && (
                      <p className="text-xs text-green-700 dark:text-green-300 mt-2">{shareStatus}</p>
                    )}
                  </div>
                )}
              </div>

              {session?.status === 'locked' && (
                <Alert variant="warning" className="mb-6">
                  🔒 Lobby is locked. New players cannot join until you unlock it.
                </Alert>
              )}

              {session?.players && session.players.length > 0 && (
                <div className="mb-6 p-4 rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800">
                  <h3 className="font-semibold mb-3 text-slate-900 dark:text-white flex items-center gap-2">
                    👥 Players in Session ({session.players.length})
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {session.players.map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between p-3 rounded bg-white dark:bg-slate-700 hover:shadow-md transition-shadow"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-slate-900 dark:text-white">
                            {player.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Score: {player.score}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemovePlayer(player.id)}
                          className="ml-2 px-3 py-1 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-slate-600 rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {session && (session.status === 'waiting' || session.status === 'locked') && (
                <div className="space-y-3">
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    isLoading={isStarting}
                    onClick={handleStartGame}
                  >
                    Start Game
                  </Button>

                  {session.status === 'waiting' ? (
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full"
                      isLoading={activeAction === 'lock'}
                      onClick={() => handleSessionAction('lock')}
                    >
                      Lock Lobby
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full"
                      isLoading={activeAction === 'unlock'}
                      onClick={() => handleSessionAction('unlock')}
                    >
                      Unlock Lobby
                    </Button>
                  )}
                </div>
              )}

              {session && session.status !== 'waiting' && session.status !== 'locked' && (
                <p className="text-center text-slate-600 dark:text-slate-400">
                  Game is {session.status === 'active' ? 'in progress' : session.status}
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Quiz Overview */}
        <Card className="shadow-xl">
          <h2 className="text-xl font-bold mb -4 text-slate-900 dark:text-white">
            Quiz Overview
          </h2>
          <div className="space-y-3">
            {quiz.questions.map((q, idx) => (
              <div key={q.id} className="p-3 rounded bg-slate-50 dark:bg-slate-700">
                <p className="font-medium text-sm text-slate-900 dark:text-white">
                  Q{idx + 1}: {q.text}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  {q.timerSeconds}s • {q.choices.length} choices
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
