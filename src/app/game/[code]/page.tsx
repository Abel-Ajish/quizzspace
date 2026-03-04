'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PusherJs from 'pusher-js';
import { Card, Button, Alert } from '@/components/ui';
import { useGame } from '@/contexts/GameContext';

interface Choice {
  id: string;
  text: string;
}

interface Question {
  id: string;
  text: string;
  timerSeconds: number;
  choices: Choice[];
}

interface SessionData {
  id: string;
  joinCode: string;
  status: 'waiting' | 'locked' | 'active' | 'paused' | 'finished';
  currentQuestionIndex: number;
  quiz: {
    id: string;
    title: string;
    questions: Question[];
  };
  players: Player[];
}

interface LiteSessionData {
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

interface Player {
  id: string;
  name: string;
  score: number;
}

interface RankedPlayer extends Player {
  rank: number;
}

interface AnswerFeedback {
  selectedChoiceId: string;
  correctChoiceId: string;
  correctChoiceText: string;
  isCorrect: boolean;
  pointsAwarded: number;
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const { currentPlayer, isHost, gamePhase, setGamePhase, hasSubmittedAnswer, setHasSubmittedAnswer, wasRemoved, setWasRemoved, reset } =
    useGame();

  const code = params.code as string;

  const [session, setSession] = useState<SessionData | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [timeStarted, setTimeStarted] = useState<number>(0);
  const [pauseStartedAt, setPauseStartedAt] = useState<number | null>(null);
  const [removed, setRemoved] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const [hostCorrectChoiceId, setHostCorrectChoiceId] = useState<string | null>(null);
  const [hostCorrectChoiceText, setHostCorrectChoiceText] = useState<string | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<AnswerFeedback | null>(null);
  const currentQuestionIndex = session?.currentQuestionIndex;
  const sessionEtagRef = useRef<string | null>(null);

  const mergeLiteSession = useCallback((data: LiteSessionData) => {
    setSession((current) => {
      if (!current) return current;

      return {
        ...current,
        status: data.status,
        currentQuestionIndex: data.currentQuestionIndex,
        players: data.players,
        quiz: {
          ...current.quiz,
          id: data.quiz.id,
          title: data.quiz.title,
        },
      };
    });
  }, []);

  const handleSubmitAnswer = useCallback(async () => {
    if (!selectedChoiceId || !currentPlayer || !session) return;
    if (removed || wasRemoved) return;

    const currentQuestion = session.quiz.questions[session.currentQuestionIndex];
    const timeTaken = Date.now() - timeStarted;

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          playerId: currentPlayer.id,
          questionId: currentQuestion.id,
          selectedChoiceId,
          timeTaken,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (errData.error === 'Player not found in this session') {
          setRemoved(true);
          setWasRemoved(true);
          return;
        }
        throw new Error(errData.error || 'Failed to submit answer');
      }

      const data = (await response.json()) as { answerResult?: AnswerFeedback };
      if (data.answerResult) {
        setAnswerFeedback(data.answerResult);
      }

      setHasSubmittedAnswer(true);
      setGamePhase('leaderboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit answer');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedChoiceId,
    currentPlayer,
    session,
    removed,
    wasRemoved,
    timeStarted,
    setWasRemoved,
    setHasSubmittedAnswer,
    setGamePhase,
  ]);

  // Fetch session data
  useEffect(() => {
    // Allow host OR player to stay; redirect only if neither
    if (!currentPlayer && !isHost) {
      router.push('/');
      return;
    }

    // If this player was previously removed, redirect immediately
    if (wasRemoved && !isHost) {
      router.push('/');
      return;
    }
    sessionEtagRef.current = null;
    let isPolling = false;
    let stopped = false;
    let pollDelayMs = 6000;

    const MIN_POLL_DELAY_MS = 6000;
    const MAX_POLL_DELAY_MS = 30000;
    const POLL_BACKOFF_MULTIPLIER = 1.8;

    let pollTimeout: ReturnType<typeof setTimeout> | null = null;

    let hasFullSession = false;

    const fetchSession = async () => {
      if (isPolling) return;
      isPolling = true;

      try {
        const response = await fetch(`/api/session/${code}?mode=lite`, {
          headers: sessionEtagRef.current
            ? { 'If-None-Match': sessionEtagRef.current }
            : undefined,
        });

        if (response.status === 304) {
          pollDelayMs = MIN_POLL_DELAY_MS;
          setIsReconnecting((prev) => {
            if (prev) {
              setShowReconnected(true);
            }
            return false;
          });
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

        const data: LiteSessionData = await response.json();

        setIsReconnecting((prev) => {
          if (prev) {
            setShowReconnected(true);
          }
          return false;
        });

        if (hasFullSession) {
          mergeLiteSession(data);
        }

        // For players (not host): check if they are still in the session
        if (currentPlayer && !isHost) {
          const playerStillInSession = data.players.some(
            (p) => p.id === currentPlayer.id
          );
          if (!playerStillInSession) {
            setRemoved(true);
            setWasRemoved(true);
            return;
          }
        }

        if (data.status === 'finished') {
          setGamePhase('finished');
          router.push(`/results/${code}`);
        }
      } catch (err) {
        console.error('Failed to fetch session:', err);
        setError('Failed to load session');
        setIsReconnecting(true);
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

    const fetchFullSession = async () => {
      try {
        const response = await fetch(`/api/session/${code}`);
        if (!response.ok) throw new Error('Session not found');

        const data: SessionData = await response.json();
        setSession(data);
        hasFullSession = true;
      } catch (err) {
        console.error('Failed to fetch full session:', err);
        setError('Failed to load session');
      }
    };

    fetchFullSession().then(() => {
      fetchSession();
    });

    let pusher: PusherJs | null = null;
    let channel: ReturnType<InstanceType<typeof PusherJs>['subscribe']> | null = null;
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
        channel.bind('leaderboard_update', onSessionEvent);
        channel.bind('session_paused', onSessionEvent);
        channel.bind('session_resumed', onSessionEvent);
        channel.bind('game_over', onSessionEvent);
      } catch (err) {
        console.error('Failed to initialize game realtime updates:', err);
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
        pusher.unsubscribe(`session-${code}`);
        pusher.disconnect();
      }
    };
  }, [code, currentPlayer, isHost, router, setGamePhase, wasRemoved, setWasRemoved, mergeLiteSession]);

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

  // Reset answer state when question changes
  useEffect(() => {
    if (currentQuestionIndex === undefined) return;

    setSelectedChoiceId(null);
    setHasSubmittedAnswer(false);
    setTimeStarted(0);
    setTimeLeft(0);
    setPauseStartedAt(null);
    setHostCorrectChoiceId(null);
    setHostCorrectChoiceText(null);
    setAnswerFeedback(null);
  }, [currentQuestionIndex, setHasSubmittedAnswer]);

  useEffect(() => {
    if (!session || timeStarted === 0 || hasSubmittedAnswer) return;

    if (session.status === 'paused' && pauseStartedAt === null) {
      setPauseStartedAt(Date.now());
      return;
    }

    if (session.status === 'active' && pauseStartedAt !== null) {
      const pausedDuration = Date.now() - pauseStartedAt;
      setTimeStarted((previous) => (previous === 0 ? 0 : previous + pausedDuration));
      setPauseStartedAt(null);
    }
  }, [session, timeStarted, hasSubmittedAnswer, pauseStartedAt]);

  // Fetch correct answer for host display
  useEffect(() => {
    if (!isHost || !code || currentQuestionIndex === undefined) return;

    const fetchHostAnswer = async () => {
      try {
        const res = await fetch(`/api/session/${code}/host-answer`);
        if (!res.ok) return;

        const data = await res.json();
        setHostCorrectChoiceId(data.correctChoiceId ?? null);
        setHostCorrectChoiceText(data.correctChoiceText ?? null);
      } catch (err) {
        console.error('Failed to fetch host correct answer:', err);
      }
    };

    fetchHostAnswer();
  }, [isHost, code, currentQuestionIndex]);

  // Handle timer countdown
  useEffect(() => {
    if (!session) return;

    if (session.status !== 'active') {
      return;
    }

    const currentQuestion = session.quiz.questions[session.currentQuestionIndex];
    if (!currentQuestion || hasSubmittedAnswer) return;

    if (timeStarted === 0) {
      setTimeStarted(Date.now());
      setTimeLeft(currentQuestion.timerSeconds);
    }

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - timeStarted) / 1000);
      const remaining = Math.max(0, currentQuestion.timerSeconds - elapsed);
      setTimeLeft(remaining);

      if (remaining === 0) {
        clearInterval(timer);
        if (!hasSubmittedAnswer && selectedChoiceId) {
          handleSubmitAnswer();
        }
      }
    }, 100);

    return () => clearInterval(timer);
  }, [session, timeStarted, hasSubmittedAnswer, selectedChoiceId, handleSubmitAnswer]);

  if (removed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-red-50 to-pink-100 dark:from-slate-900 dark:to-slate-800 animate-fade-in">
        <Card className="w-full max-w-md shadow-xl animate-scale-in">
          <Alert variant="error">
            <p className="text-lg font-bold">You have been removed</p>
            <p className="text-sm mt-2">The host has removed you from this game. Redirecting to home...</p>
          </Alert>
        </Card>
      </div>
    );
  }

  if (!session || (!currentPlayer && !isHost)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 animate-fade-in">
        <div className="text-center">
          <div className="inline-block mb-6">
            <div className="w-16 h-16 border-4 border-blue-300 border-t-blue-600 rounded-full animate-spin-slow"></div>
          </div>
          <p className="text-lg font-semibold text-slate-900 dark:text-white animate-slide-up">
            Loading game...
          </p>
        </div>
      </div>
    );
  }

  const currentQuestion = session.quiz.questions[session.currentQuestionIndex];
  const currentPlayerScore = currentPlayer
    ? session.players.find((player) => player.id === currentPlayer.id)?.score ?? 0
    : 0;
  const sortedPlayers = [...session.players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    if (byName !== 0) return byName;

    return a.id.localeCompare(b.id);
  });

  let previousScore: number | null = null;
  let currentRank = 0;
  const rankedPlayers: RankedPlayer[] = sortedPlayers.map((player) => {
    if (previousScore === null || player.score < previousScore) {
      currentRank += 1;
      previousScore = player.score;
    }

    return {
      ...player,
      rank: currentRank,
    };
  });

  // Host control view
  if (isHost && !currentPlayer) {
    const handleNextQuestion = async () => {
      if (!session) return;

      setIsSubmitting(true);
      setError('');

      try {
        const response = await fetch('/api/session/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'next',
            sessionId: session.id,
          }),
        });

        if (!response.ok) throw new Error('Failed to advance question');

        // Fetch updated session
        const sessionRes = await fetch(`/api/session/${code}?mode=lite`);
        if (sessionRes.ok) {
          const updatedSession: LiteSessionData = await sessionRes.json();
          mergeLiteSession(updatedSession);

          if (updatedSession.status === 'finished') {
            setGamePhase('finished');
            router.push(`/results/${code}`);
          }
        }
      } catch (err) {
        setError('Failed to advance to next question');
        console.error(err);
      } finally {
        setIsSubmitting(false);
      }
    };

    const handlePauseResume = async () => {
      if (!session) return;

      const action = session.status === 'paused' ? 'resume' : 'pause';

      setIsSubmitting(true);
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

        const controlData = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(controlData.error || `Failed to ${action} game`);
        }

        const sessionRes = await fetch(`/api/session/${code}?mode=lite`);
        if (sessionRes.ok) {
          const updatedSession: LiteSessionData = await sessionRes.json();
          mergeLiteSession(updatedSession);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to ${action} game`);
        console.error(err);
      } finally {
        setIsSubmitting(false);
      }
    };

    // Show fullscreen leaderboard when in leaderboard phase (answers submitted)
    if (gamePhase === 'leaderboard') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-slate-900 dark:to-slate-800 p-4 animate-fade-in">
          <div className="max-w-3xl mx-auto">
            <div className="mb-8 text-center animate-slide-down">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-3">
                {session.quiz.title}
              </h1>
              <p className="text-lg text-slate-600 dark:text-slate-400">
                Question {session.currentQuestionIndex + 1} of {session.quiz.questions.length} • 📊 Leaderboard
              </p>
            </div>

            {error && (
              <Alert variant="error" className="mb-6 animate-slide-up">
                ❌ {error}
              </Alert>
            )}

            {isReconnecting && (
              <Alert variant="warning" className="mb-6 animate-slide-up">
                🌐 Reconnecting to live game...
              </Alert>
            )}

            {showReconnected && (
              <Alert variant="success" className="mb-6 animate-slide-up">
                ✅ Reconnected. Live updates restored.
              </Alert>
            )}

            <Card className="shadow-xl mb-6 animate-scale-in">
              <h2 className="text-2xl font-bold mb-6 text-slate-900 dark:text-white text-center">
                🏆 Current Scores
              </h2>

              <div className="space-y-3">
                {rankedPlayers.map((player, idx) => {
                  const medals = ['🥇', '🥈', '🥉'];
                  const medal = player.rank <= 3 ? medals[player.rank - 1] : '  ';

                  return (
                    <div
                      key={player.id}
                      className="flex justify-between items-center p-4 rounded-lg bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-600 hover:shadow-md transition-all duration-300 transform hover:scale-102 opacity-0 animate-[slideUp_0.4s_ease-out_forwards]"
                      style={{ animationDelay: `${idx * 60}ms` }}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-3xl w-8">{medal}</span>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
                            #{player.rank} {player.name}
                          </p>
                        </div>
                      </div>
                      <span className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
                        {player.score}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <div className="flex gap-3 animate-slide-up">
              {session.currentQuestionIndex < session.quiz.questions.length - 1 ? (
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  isLoading={isSubmitting}
                  disabled={session.status !== 'active'}
                  onClick={handleNextQuestion}
                >
                  ➜ Next Question
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  isLoading={isSubmitting}
                  disabled={session.status !== 'active'}
                  onClick={handleNextQuestion}
                >
                  🏁 End Game & View Results
                </Button>
              )}
              <Button
                variant="outline"
                size="lg"
                onClick={handlePauseResume}
              >
                {session.status === 'paused' ? 'Resume' : 'Pause'}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => router.push('/')}
              >
                Exit
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 dark:from-slate-900 dark:to-slate-800 p-4 animate-fade-in">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex justify-between items-start animate-slide-down">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                {session.quiz.title}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Question {session.currentQuestionIndex + 1} of {session.quiz.questions.length} • 🎮 Host Control
              </p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors duration-200"
            >
              Exit
            </button>
          </div>

          {error && (
            <Alert variant="error" className="mb-6 animate-slide-up">
              ❌ {error}
            </Alert>
          )}

          {isReconnecting && (
            <Alert variant="warning" className="mb-6 animate-slide-up">
              🌐 Reconnecting to live game...
            </Alert>
          )}

          {showReconnected && (
            <Alert variant="success" className="mb-6 animate-slide-up">
              ✅ Reconnected. Live updates restored.
            </Alert>
          )}

          {session.status === 'paused' && (
            <Alert variant="warning" className="mb-6 animate-slide-up">
              ⏸️ Game is paused. Resume to continue the timer and allow answers.
            </Alert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Current Question */}
            <div className="lg:col-span-2 animate-scale-in">
              <Card className="shadow-xl">
                {currentQuestion ? (
                  <>
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold mb-6 text-slate-900 dark:text-white">
                        {currentQuestion.text}
                      </h2>
                      <div className="space-y-3">
                        {currentQuestion.choices.map((choice, idx) => (
                          <div
                            key={choice.id}
                            className={`p-4 rounded-lg text-slate-900 dark:text-white hover:shadow-md transition-all duration-200 border-l-4 opacity-0 animate-[slideUp_0.3s_ease-out_forwards] ${
                              hostCorrectChoiceId === choice.id
                                ? 'bg-green-100 dark:bg-green-900/30 border-green-500'
                                : 'bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 border-blue-500'
                            }`}
                            style={{ animationDelay: `${idx * 50}ms` }}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span>{choice.text}</span>
                              {hostCorrectChoiceId === choice.id && (
                                <span className="text-xs font-bold text-green-700 dark:text-green-300 bg-green-200 dark:bg-green-800 px-2 py-1 rounded">
                                  Correct
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {hostCorrectChoiceText && (
                        <div className="mt-4 p-3 rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20">
                          <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                            ✅ Correct Answer: {hostCorrectChoiceText}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      {session.currentQuestionIndex < session.quiz.questions.length - 1 ? (
                        <Button
                          variant="primary"
                          size="lg"
                          className="w-full"
                          isLoading={isSubmitting}
                          disabled={session.status !== 'active'}
                          onClick={handleNextQuestion}
                        >
                          ➜ Next Question
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="lg"
                          className="w-full"
                          isLoading={isSubmitting}
                          disabled={session.status !== 'active'}
                          onClick={handleNextQuestion}
                        >
                          🏁 End Game
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full sm:w-auto"
                        onClick={handlePauseResume}
                      >
                        {session.status === 'paused' ? 'Resume' : 'Pause'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-8 animate-slide-up">
                    <p className="text-lg text-slate-600 dark:text-slate-400 mb-4">No more questions</p>
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full"
                      onClick={() => router.push(`/results/${code}`)}
                    >
                      View Results
                    </Button>
                  </div>
                )}
              </Card>
            </div>

            {/* Leaderboard */}
            <div className="animate-scale-in">
              <Card className="shadow-xl sticky top-4">
                <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-white text-center">
                  🏆 Leaderboard
                </h3>
                <div className="space-y-2">
                  {rankedPlayers.map((player, idx) => (
                      <div
                        key={player.id}
                        className="flex justify-between items-center p-3 rounded-lg bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-600 hover:shadow-md transition-all duration-200 opacity-0 animate-[slideUp_0.3s_ease-out_forwards]"
                        style={{ animationDelay: `${idx * 40}ms` }}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-600 dark:text-slate-400 text-sm">
                            #{player.rank}
                          </span>
                          <span className="font-medium text-slate-900 dark:text-white text-sm">
                            {player.name}
                          </span>
                        </div>
                        <span className="font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
                          {player.score}
                        </span>
                      </div>
                    ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 animate-fade-in">
        <Card className="w-full max-w-md animate-scale-in">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">⏳ Next Question Loading</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">Waiting for host to proceed...</p>
            </div>
            <div className="w-10 h-10 border-3 border-blue-300 border-t-blue-600 rounded-full animate-spin-slow"></div>
          </div>
        </Card>
      </div>
    );
  }

  const isAnswerLocked = hasSubmittedAnswer || timeLeft === 0 || session.status !== 'active';
  const timerColor =
    timeLeft > 10 ? 'text-green-600 dark:text-green-400' : timeLeft > 5 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400';

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-100 dark:from-slate-900 dark:to-slate-800 p-4 animate-fade-in">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start animate-slide-down">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              {session.quiz.title}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Question {session.currentQuestionIndex + 1} of {session.quiz.questions.length}
            </p>
          </div>

          {/* Player Score + Timer */}
          <div className="text-right">
            <div className="mb-2 inline-block px-3 py-1 rounded-lg bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-700">
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                Score: {currentPlayerScore}
              </p>
            </div>
            <div className={`text-5xl font-bold font-mono transition-all duration-300 ${timerColor} ${timeLeft < 5 ? 'animate-pulse' : ''}`}>
              {timeLeft}s
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="error" className="mb-6 animate-slide-up">
            ❌ {error}
          </Alert>
        )}

        {isReconnecting && (
          <Alert variant="warning" className="mb-6 animate-slide-up">
            🌐 Reconnecting to live game...
          </Alert>
        )}

        {showReconnected && (
          <Alert variant="success" className="mb-6 animate-slide-up">
            ✅ Reconnected. Live updates restored.
          </Alert>
        )}

        {session.status === 'paused' && (
          <Alert variant="warning" className="mb-6 animate-slide-up">
            ⏸️ The host paused the game. Your timer is frozen until it resumes.
          </Alert>
        )}

        {/* Question Card */}
        <Card className="shadow-xl mb-6 animate-scale-in">
          <h2 className="text-2xl font-bold mb-8 text-slate-900 dark:text-white">
            {currentQuestion.text}
          </h2>

          {/* Answer Choices */}
          <div className="space-y-3">
            {currentQuestion.choices.map((choice, idx) => (
              <button
                key={choice.id}
                disabled={isAnswerLocked}
                onClick={() => !isAnswerLocked && setSelectedChoiceId(choice.id)}
                className={`w-full p-4 rounded-lg font-medium transition-all duration-200 text-left transform opacity-0 animate-[slideUp_0.3s_ease-out_forwards] ${
                  hasSubmittedAnswer && answerFeedback
                    ? choice.id === answerFeedback.correctChoiceId
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100 ring-2 ring-green-400 ring-offset-2 shadow-lg'
                      : choice.id === answerFeedback.selectedChoiceId
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-100 ring-2 ring-red-400 ring-offset-2 shadow-lg'
                      : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300'
                    : selectedChoiceId === choice.id
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white ring-2 ring-blue-400 ring-offset-2 scale-102 shadow-lg'
                    : isAnswerLocked
                    ? 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-400'
                    : 'bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 text-slate-900 dark:text-white hover:shadow-lg hover:from-slate-200 hover:to-slate-300 dark:hover:from-slate-600 dark:hover:to-slate-500 active:scale-95'
                } ${isAnswerLocked ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer'}
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600`}
                aria-pressed={selectedChoiceId === choice.id}
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="flex items-center gap-4 justify-between">
                  <div className="flex items-center gap-4 flex-1">
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                      (hasSubmittedAnswer && answerFeedback
                        ? choice.id === answerFeedback.correctChoiceId
                        : selectedChoiceId === choice.id)
                        ? 'border-white bg-white'
                        : 'border-slate-400 dark:border-slate-500'
                    }`}
                  >
                    {(hasSubmittedAnswer && answerFeedback
                      ? choice.id === answerFeedback.correctChoiceId
                      : selectedChoiceId === choice.id) && (
                      <div className="w-4 h-4 bg-blue-600 rounded-full animate-scale-in"></div>
                    )}
                  </div>
                  <span className="flex-1">{choice.text}</span>
                  </div>
                  {hasSubmittedAnswer && answerFeedback && choice.id === answerFeedback.correctChoiceId && (
                    <span className="text-xs font-bold px-2 py-1 rounded bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200">
                      Correct
                    </span>
                  )}
                  {hasSubmittedAnswer && answerFeedback && !answerFeedback.isCorrect && choice.id === answerFeedback.selectedChoiceId && (
                    <span className="text-xs font-bold px-2 py-1 rounded bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200">
                      Wrong
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Submit Button */}
          {session.status === 'paused' ? (
            <div className="mt-8 p-4 bg-gradient-to-r from-yellow-100 to-yellow-200 dark:from-yellow-900/30 dark:to-yellow-800/30 rounded-lg text-center border-2 border-yellow-300 dark:border-yellow-700 animate-slide-up">
              <p className="font-bold text-yellow-900 dark:text-yellow-100 text-lg">
                ⏸️ Game Paused
              </p>
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-2">Waiting for host to resume...</p>
            </div>
          ) : !isAnswerLocked ? (
            <Button
              variant="primary"
              size="lg"
              className="w-full mt-8 animate-slide-up"
              disabled={!selectedChoiceId || isSubmitting}
              isLoading={isSubmitting}
              onClick={handleSubmitAnswer}
            >
              ✓ Submit Answer
            </Button>
          ) : (
            <div className="mt-8 p-4 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 rounded-lg text-center border-2 border-slate-400 dark:border-slate-500 animate-slide-up">
              <p className="font-bold text-slate-900 dark:text-white text-lg">
                {hasSubmittedAnswer
                  ? answerFeedback?.isCorrect
                    ? `✅ Correct! +${answerFeedback.pointsAwarded} points`
                    : '❌ Wrong answer'
                  : '⏱️ Time\'s Up!'}
              </p>
              {hasSubmittedAnswer && answerFeedback ? (
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">
                  Correct option: <span className="font-semibold">{answerFeedback.correctChoiceText}</span>
                </p>
              ) : (
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">Waiting for next question...</p>
              )}
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
