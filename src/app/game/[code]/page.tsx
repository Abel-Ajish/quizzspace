'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  status: 'waiting' | 'active' | 'finished';
  currentQuestionIndex: number;
  quiz: {
    id: string;
    title: string;
    questions: Question[];
  };
  players: Player[];
}

interface Player {
  id: string;
  name: string;
  score: number;
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const { currentPlayer, isHost, gamePhase, setGamePhase, hasSubmittedAnswer, setHasSubmittedAnswer } =
    useGame();

  const code = params.code as string;

  const [session, setSession] = useState<SessionData | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [timeStarted, setTimeStarted] = useState<number>(0);

  // Fetch session data
  useEffect(() => {
    if (!currentPlayer && !isHost) {
      router.push('/');
      return;
    }

    const fetchSession = async () => {
      try {
        const response = await fetch(`/api/session/${code}`);
        if (!response.ok) throw new Error('Session not found');

        const data: SessionData = await response.json();
        setSession(data);

        if (data.status === 'finished') {
          setGamePhase('finished');
          router.push(`/results/${code}`);
        }
      } catch (err) {
        console.error('Failed to fetch session:', err);
        setError('Failed to load session');
      }
    };

    fetchSession();
    const sessionInterval = setInterval(fetchSession, 3000);
    return () => clearInterval(sessionInterval);
  }, [code, currentPlayer, router, setGamePhase]);

  // Reset answer state when question changes
  useEffect(() => {
    if (!session) return;

    setSelectedChoiceId(null);
    setHasSubmittedAnswer(false);
    setTimeStarted(0);
    setTimeLeft(0);
  }, [session?.currentQuestionIndex, setHasSubmittedAnswer]);

  // Handle timer countdown
  useEffect(() => {
    if (!session) return;

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
  }, [session, timeStarted, hasSubmittedAnswer, selectedChoiceId]);

  const handleSubmitAnswer = async () => {
    if (!selectedChoiceId || !currentPlayer || !session) return;

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

      if (!response.ok) throw new Error('Failed to submit answer');

      setHasSubmittedAnswer(true);
      setGamePhase('leaderboard');
    } catch (err) {
      setError('Failed to submit answer');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

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
        const sessionRes = await fetch(`/api/session/${code}`);
        if (sessionRes.ok) {
          const updatedSession = await sessionRes.json();
          setSession(updatedSession);

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

    // Show fullscreen leaderboard when in leaderboard phase (answers submitted)
    if (gamePhase === 'leaderboard') {
      const sortedPlayers = [...session.players].sort((a, b) => b.score - a.score);

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

            <Card className="shadow-xl mb-6 animate-scale-in">
              <h2 className="text-2xl font-bold mb-6 text-slate-900 dark:text-white text-center">
                🏆 Current Scores
              </h2>

              <div className="space-y-3">
                {sortedPlayers.map((player, idx) => {
                  const medals = ['🥇', '🥈', '🥉'];
                  const medal = idx < 3 ? medals[idx] : '  ';

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
                            #{idx + 1} {player.name}
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
                  onClick={handleNextQuestion}
                >
                  🏁 End Game & View Results
                </Button>
              )}
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
                            className="p-4 rounded-lg bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 text-slate-900 dark:text-white hover:shadow-md transition-all duration-200 border-l-4 border-blue-500 opacity-0 animate-[slideUp_0.3s_ease-out_forwards]"
                            style={{ animationDelay: `${idx * 50}ms` }}
                          >
                            {choice.text}
                          </div>
                        ))}
                      </div>
                    </div>
                    {session.currentQuestionIndex < session.quiz.questions.length - 1 ? (
                      <Button
                        variant="primary"
                        size="lg"
                        className="w-full"
                        isLoading={isSubmitting}
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
                        onClick={handleNextQuestion}
                      >
                        🏁 End Game
                      </Button>
                    )}
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
                  {session.players
                    .sort((a, b) => b.score - a.score)
                    .map((player, idx) => (
                      <div
                        key={player.id}
                        className="flex justify-between items-center p-3 rounded-lg bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-600 hover:shadow-md transition-all duration-200 opacity-0 animate-[slideUp_0.3s_ease-out_forwards]"
                        style={{ animationDelay: `${idx * 40}ms` }}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-600 dark:text-slate-400 text-sm">
                            #{idx + 1}
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

  const isAnswerLocked = hasSubmittedAnswer || timeLeft === 0;
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

          {/* Timer */}
          <div className={`text-5xl font-bold font-mono transition-all duration-300 ${timerColor} ${timeLeft < 5 ? 'animate-pulse' : ''}`}>
            {timeLeft}s
          </div>
        </div>

        {error && (
          <Alert variant="error" className="mb-6 animate-slide-up">
            ❌ {error}
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
                  selectedChoiceId === choice.id
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white ring-2 ring-blue-400 ring-offset-2 scale-102 shadow-lg'
                    : isAnswerLocked
                    ? 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-400'
                    : 'bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 text-slate-900 dark:text-white hover:shadow-lg hover:from-slate-200 hover:to-slate-300 dark:hover:from-slate-600 dark:hover:to-slate-500 active:scale-95'
                } ${isAnswerLocked ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer'}
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600`}
                aria-pressed={selectedChoiceId === choice.id}
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                      selectedChoiceId === choice.id
                        ? 'border-white bg-white'
                        : 'border-slate-400 dark:border-slate-500'
                    }`}
                  >
                    {selectedChoiceId === choice.id && (
                      <div className="w-4 h-4 bg-blue-600 rounded-full animate-scale-in"></div>
                    )}
                  </div>
                  <span className="flex-1">{choice.text}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Submit Button */}
          {!isAnswerLocked ? (
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
                {hasSubmittedAnswer ? '✅ Answer Submitted!' : '⏱️ Time\'s Up!'}
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">
                Waiting for next question...
              </p>
            </div>
          )}
        </Card>

        {/* Leaderboard Preview */}
        <Card className="shadow-xl animate-scale-in">
          <h3 className="font-bold mb-4 text-slate-900 dark:text-white text-center text-lg">
            📊 Live Leaderboard (Top 5)
          </h3>
          <div className="space-y-2">
            {session.players
              .sort((a, b) => b.score - a.score)
              .slice(0, 5)
              .map((player, idx) => (
                <div
                  key={player.id}
                  className={`flex justify-between items-center p-3 rounded-lg transition-all duration-200 opacity-0 animate-[slideUp_0.3s_ease-out_forwards] ${
                    currentPlayer && player.id === currentPlayer.id
                      ? 'bg-gradient-to-r from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 border-2 border-blue-500 font-bold'
                      : 'bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-600 hover:shadow-md'
                  }`}
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <span className="font-medium text-slate-900 dark:text-white">
                    #{idx + 1} {player.name}
                    {currentPlayer && player.id === currentPlayer.id && <span className="ml-2 text-sm">⭐</span>}
                  </span>
                  <span className="font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
                    {player.score}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
