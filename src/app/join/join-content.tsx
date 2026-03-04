'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, Alert, Button, Input } from '@/components/ui';
import { useGame } from '@/contexts/GameContext';

export function JoinPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession, setCurrentPlayer } = useGame();

  const code = (searchParams.get('code') || '').toUpperCase();
  const playerNameFromQuery = searchParams.get('name') || '';

  const [nameInput, setNameInput] = useState(playerNameFromQuery ? decodeURIComponent(playerNameFromQuery) : '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const joinWithName = useCallback(
    async (rawName: string) => {
      if (!code) return;

      const finalName = rawName.trim();
      if (!finalName) {
        setError('Player name is required');
        return;
      }

      setIsLoading(true);
      setError('');

      try {
        const sessionRes = await fetch(`/api/session/${code}?mode=lite`);
        if (!sessionRes.ok) {
          throw new Error('Invalid join code or session not found');
        }
        const sessionData = await sessionRes.json();

        if (sessionData.status === 'locked') {
          throw new Error('Lobby is currently locked by the host');
        }

        if (sessionData.status !== 'waiting') {
          throw new Error('This session is no longer accepting new players');
        }

        setSession(sessionData);

        const joinRes = await fetch('/api/player', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            playerName: finalName,
          }),
        });

        if (!joinRes.ok) {
          const errorData = await joinRes.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to join session');
        }

        const { player } = await joinRes.json();
        setCurrentPlayer(player);
        sessionStorage.setItem('currentPlayerId', player.id);
        localStorage.setItem('last_join_code', code);
        localStorage.setItem('last_player_name', finalName);
        router.push(`/lobby/${code}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to join session. Please try again.');
        setIsLoading(false);
      }
    },
    [code, router, setCurrentPlayer, setSession]
  );

  useEffect(() => {
    if (!code) {
      router.push('/');
      return;
    }

    if (playerNameFromQuery) {
      joinWithName(decodeURIComponent(playerNameFromQuery));
    }
  }, [code, playerNameFromQuery, router, joinWithName]);

  const handleNameOnlyJoin = (e: React.FormEvent) => {
    e.preventDefault();
    joinWithName(nameInput);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 animate-fade-in">
        <div className="text-center animate-pop-in">
          <div className="inline-block mb-6">
            <div className="w-16 h-16 border-4 border-blue-300 border-t-blue-600 rounded-full animate-spin-slow animate-float-soft"></div>
          </div>
          <p className="text-lg font-semibold text-slate-900 dark:text-white mb-2 animate-slide-up">
            Joining session...
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 animate-slide-up">
            {code} as <span className="font-medium">{playerNameFromQuery || nameInput}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 animate-fade-in">
      <Card className="w-full max-w-md shadow-xl animate-scale-in animate-delay-100">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 text-center">
          Join Quiz
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 text-center">
          Code: <span className="font-bold tracking-wider">{code}</span>
        </p>

        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}

        {!playerNameFromQuery && (
          <form onSubmit={handleNameOnlyJoin} className="space-y-4">
            <Input
              label="Your Name"
              placeholder="Enter your name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={50}
              disabled={isLoading}
              error={error && !nameInput.trim() ? 'Name is required' : ''}
            />
            <Button type="submit" variant="primary" className="w-full" isLoading={isLoading}>
              Join Lobby
            </Button>
          </form>
        )}

        {playerNameFromQuery && (
          <Button variant="primary" className="w-full" onClick={() => joinWithName(decodeURIComponent(playerNameFromQuery))}>
            Retry Join
          </Button>
        )}

        <Button
          variant="outline"
          className="w-full mt-3"
          onClick={() => router.push('/')}
        >
          Return to Home
        </Button>
      </Card>
    </div>
  );
}
