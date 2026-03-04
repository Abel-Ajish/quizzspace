'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, Button, Alert } from '@/components/ui';
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
  quiz: {
    id: string;
    title: string;
  };
  players: Player[];
}

interface RankedPlayer extends Player {
  rank: number;
}

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const { currentPlayer, isHost, reset } = useGame();

  const code = params.code as string;

  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!currentPlayer && !isHost) {
      router.push('/');
      return;
    }

    const fetchSession = async () => {
      try {
        const response = await fetch(`/api/session/${code}?mode=lite`);
        if (!response.ok) throw new Error('Session not found');

        const data: SessionData = await response.json();
        setSession(data);
      } catch (err) {
        console.error('Failed to fetch session:', err);
        router.push('/');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSession();
  }, [code, currentPlayer, isHost, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-50 to-emerald-100 dark:from-slate-900 dark:to-slate-800 animate-fade-in">
        <div className="text-center">
          <div className="inline-block mb-6">
            <div className="w-16 h-16 border-4 border-green-300 border-t-green-600 rounded-full animate-spin-slow"></div>
          </div>
          <p className="text-lg font-semibold text-slate-900 dark:text-white animate-slide-up">
            Loading results...
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 animate-fade-in">
        <Alert variant="error">❌ Failed to load results</Alert>
      </div>
    );
  }

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

  const currentPlayerEntry = currentPlayer
    ? rankedPlayers.find((player) => player.id === currentPlayer.id)
    : null;
  const playerRank = currentPlayerEntry?.rank ?? 0;
  const playerScore = currentPlayerEntry?.score ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-slate-900 dark:to-slate-800 p-4 animate-fade-in">
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-xl mb-6 text-center animate-scale-in">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-3 animate-slide-up">
            🎉 Quiz Complete!
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-6 font-medium">
            {session.quiz.title}
            {isHost && !currentPlayer && ' - Host View'}
          </p>

          {currentPlayer && !isHost && (
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800 p-8 rounded-lg mb-6 border-2 border-blue-300 dark:border-blue-600 animate-scale-in hover:shadow-xl transition-all duration-300">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 font-medium">👑 Your Rank</p>
              <p className={`text-6xl font-bold mb-3 ${playerRank === 1 ? 'text-yellow-600' : playerRank === 2 ? 'text-gray-500' : playerRank === 3 ? 'text-orange-600' : 'text-blue-600'}`}>
                #{playerRank}
              </p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                {playerScore} <span className="text-lg">points</span>
              </p>
            </div>
          )}
        </Card>

        {/* Final Leaderboard */}
        <Card className="shadow-xl animate-scale-in">
          <h2 className="text-2xl font-bold mb-6 text-slate-900 dark:text-white text-center">
            🏆 Final Leaderboard
          </h2>

          <div className="space-y-3">
            {rankedPlayers.map((player, idx) => {
              const medals = ['🥇', '🥈', '🥉'];
              const medal = player.rank <= 3 ? medals[player.rank - 1] : '  ';
              const isCurrentPlayer = player.id === currentPlayer?.id;

              return (
                <div
                  key={player.id}
                  className={`flex justify-between items-center p-4 rounded-lg font-medium transition-all duration-300 transform hover:scale-102 hover:shadow-md opacity-0 animate-[slideUp_0.4s_ease-out_forwards] ${
                    isCurrentPlayer && !isHost
                      ? 'bg-gradient-to-r from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 border-2 border-blue-500 shadow-lg'
                      : idx < 3
                      ? 'bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-600 hover:bg-gradient-to-r hover:from-slate-100 hover:to-slate-200'
                      : 'bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600'
                  }`}
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-3xl w-8">{medal}</span>
                    <p className="text-slate-900 dark:text-white font-semibold">
                      #{player.rank} <span className="ml-2">{player.name}</span>
                      {isCurrentPlayer && !isHost && (
                        <span className="ml-3 text-xs bg-blue-600 text-white px-3 py-1 rounded-full font-bold animate-pulse">
                          ⭐ You
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
                    {player.score}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 animate-slide-up">
          {isHost && !currentPlayer && (
            <Button
              variant="secondary"
              size="lg"
              className="flex-1 sm:flex-0"
              onClick={() => {
                reset();
                router.push(`/host/${session.quiz.id}`);
              }}
            >
              🎮 Host Quiz Again
            </Button>
          )}
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={() => {
              reset();
              router.push('/');
            }}
          >
            🏠 Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
