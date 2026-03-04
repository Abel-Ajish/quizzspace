'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Input, Card, Tabs } from '@/components/ui';

interface ReconnectSessionData {
  status: 'waiting' | 'locked' | 'active' | 'paused' | 'finished';
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'join' | 'create'>('join');
  const [joinCode, setJoinCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [hasSavedJoin, setHasSavedJoin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedCode = localStorage.getItem('last_join_code') || '';
    const savedName = localStorage.getItem('last_player_name') || '';

    if (savedCode && savedName) {
      setHasSavedJoin(true);
      if (!joinCode) setJoinCode(savedCode.toUpperCase());
      if (!playerName) setPlayerName(savedName);
    }
  }, [joinCode, playerName]);

  const handleUseSavedJoin = () => {
    if (typeof window === 'undefined') return;

    const savedCode = localStorage.getItem('last_join_code') || '';
    const savedName = localStorage.getItem('last_player_name') || '';
    if (!savedCode || !savedName) return;

    setJoinCode(savedCode.toUpperCase());
    setPlayerName(savedName);
  };

  const handleClearSavedJoin = () => {
    if (typeof window === 'undefined') return;

    localStorage.removeItem('last_join_code');
    localStorage.removeItem('last_player_name');
    setHasSavedJoin(false);
  };

  const handleReconnect = async () => {
    if (typeof window === 'undefined') return;

    const savedCode = (localStorage.getItem('last_join_code') || '').toUpperCase();
    const savedName = localStorage.getItem('last_player_name') || '';

    if (!savedCode || !savedName) {
      setError('No saved session details found');
      return;
    }

    setError('');
    setIsReconnecting(true);

    try {
      const response = await fetch(`/api/session/${savedCode}?mode=lite`);
      if (!response.ok) {
        localStorage.removeItem('last_join_code');
        localStorage.removeItem('last_player_name');
        setHasSavedJoin(false);
        throw new Error('Saved session no longer exists');
      }

      const sessionData: ReconnectSessionData = await response.json();

      if (sessionData.status === 'waiting' || sessionData.status === 'locked') {
        window.location.href = `/join?code=${savedCode}&name=${encodeURIComponent(savedName)}`;
        return;
      }

      if (sessionData.status === 'active' || sessionData.status === 'paused') {
        window.location.href = `/game/${savedCode}`;
        return;
      }

      window.location.href = `/results/${savedCode}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reconnect to saved session');
      console.error(err);
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const formattedCode = joinCode.toUpperCase().trim();

      if (!formattedCode || formattedCode.length !== 6) {
        setError('Join code must be 6 characters');
        return;
      }

      if (!playerName.trim()) {
        setError('Player name is required');
        return;
      }

      // Redirect to join page
      window.location.href = `/join?code=${formattedCode}&name=${encodeURIComponent(playerName)}`;
    } catch (err) {
      setError('Failed to join session. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4 overflow-hidden">
      <a href="#main" className="skip-to-main">Skip to main content</a>
      
      <div className="w-full max-w-md animate-fade-in">
        {/* Header */}
        <div className="text-center mb-8 animate-slide-up">
          <h1 className="text-5xl font-bold text-slate-900 dark:text-white mb-2 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            LiveQuiz
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 font-medium">
            Real-time quiz platform for engaging learning
          </p>
        </div>

        <Card className="shadow-xl">
          <div className="space-y-6">
            {/* Tabs */}
            <Tabs
              tabs={[
                { label: 'Join Quiz', value: 'join' },
                { label: 'Create Quiz', value: 'create' },
              ]}
              activeTab={activeTab}
              onTabChange={(value) => setActiveTab(value as 'join' | 'create')}
            />

            {/* Join Session Tab */}
            {activeTab === 'join' && (
              <form onSubmit={handleJoinSession} className="space-y-4 animate-fade-in">
                <Input
                  label="Join Code (6 digits)"
                  placeholder="e.g., ABC123"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  disabled={isLoading}
                  aria-label="Join code input"
                  error={error && joinCode && joinCode.length !== 6 ? 'Code must be 6 characters' : ''}
                />

                <Input
                  label="Your Name"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  disabled={isLoading}
                  aria-label="Player name input"
                  error={error && !playerName ? 'Name is required' : ''}
                />

                {hasSavedJoin && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      isLoading={isReconnecting}
                      onClick={handleReconnect}
                    >
                      Reconnect
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleUseSavedJoin}
                    >
                      Use Last Details
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleClearSavedJoin}
                    >
                      Clear Saved
                    </Button>
                  </div>
                )}

                {error && (
                  <div className="text-sm text-red-600 dark:text-red-400 animate-slide-up font-medium">
                    ⚠️ {error}
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={isLoading}
                  className="w-full"
                >
                  Join Session
                </Button>
              </form>
            )}

            {/* Create Quiz Tab */}
            {activeTab === 'create' && (
              <div className="space-y-4 animate-fade-in">
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                  Create a new quiz and become the host of a live session.
                </p>
                <Link href="/create-quiz" className="block">
                  <Button variant="secondary" size="lg" className="w-full">
                    Create New Quiz
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Footer Links */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-slate-700 text-center text-sm text-slate-600 dark:text-slate-400 animate-slide-up">
            <p>
              ✨ Made with care for educators and students
            </p>
          </div>
        </Card>

        {/* Features Section */}
        <div className="mt-8 grid grid-cols-2 gap-4 text-sm animate-slide-up">
          <div className="text-center opacity-0 animate-[slideUp_0.3s_ease-out_0.1s_forwards] hover:scale-105 transition-all duration-300 cursor-pointer">
            <div className="text-3xl mb-2">⚡</div>
            <p className="font-semibold text-slate-900 dark:text-white">Real-time</p>
            <p className="text-slate-600 dark:text-slate-400 text-xs">Instant feedback</p>
          </div>
          <div className="text-center opacity-0 animate-[slideUp_0.3s_ease-out_0.2s_forwards] hover:scale-105 transition-all duration-300 cursor-pointer">
            <div className="text-3xl mb-2">📊</div>
            <p className="font-semibold text-slate-900 dark:text-white">Scoreboard</p>
            <p className="text-slate-600 dark:text-slate-400 text-xs">Live leaderboard</p>
          </div>
          <div className="text-center opacity-0 animate-[slideUp_0.3s_ease-out_0.3s_forwards] hover:scale-105 transition-all duration-300 cursor-pointer">
            <div className="text-3xl mb-2">🎯</div>
            <p className="font-semibold text-slate-900 dark:text-white">Engaging</p>
            <p className="text-slate-600 dark:text-slate-400 text-xs">Interactive learning</p>
          </div>
          <div className="text-center opacity-0 animate-[slideUp_0.3s_ease-out_0.4s_forwards] hover:scale-105 transition-all duration-300 cursor-pointer">
            <div className="text-3xl mb-2">📱</div>
            <p className="font-semibold text-slate-900 dark:text-white">Mobile Ready</p>
            <p className="text-slate-600 dark:text-slate-400 text-xs">Works anywhere</p>
          </div>
        </div>
      </div>
    </div>
  );
}
