'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface IQuestion {
  id: string;
  text: string;
  timerSeconds: number;
  orderIndex: number;
  choices: IChoice[];
}

export interface IChoice {
  id: string;
  text: string;
  isCorrect?: boolean; // Only on server, not in responses to clients
}

export interface IPlayer {
  id: string;
  name: string;
  score: number;
}

export interface IQuiz {
  id: string;
  title: string;
  questions: IQuestion[];
  createdAt: string;
}

export interface ISession {
  id: string;
  joinCode: string;
  status: 'waiting' | 'active' | 'finished';
  currentQuestionIndex: number;
  quiz: IQuiz;
  players: IPlayer[];
  startedAt?: string;
  endedAt?: string;
}

interface GameContextType {
  // Session state
  session: ISession | null;
  setSession: (session: ISession | null) => void;

  // Player state
  currentPlayer: IPlayer | null;
  setCurrentPlayer: (player: IPlayer | null) => void;

  // UI state
  isHost: boolean;
  setIsHost: (isHost: boolean) => void;

  // Leaderboard
  leaderboard: IPlayer[];
  setLeaderboard: (leaderboard: IPlayer[]) => void;

  // Current question
  currentQuestion: IQuestion | null;

  // Game phase
  gamePhase: 'lobby' | 'question' | 'leaderboard' | 'finished';
  setGamePhase: (phase: 'lobby' | 'question' | 'leaderboard' | 'finished') => void;

  // Submission state
  hasSubmittedAnswer: boolean;
  setHasSubmittedAnswer: (submitted: boolean) => void;

  // Removed flag
  wasRemoved: boolean;
  setWasRemoved: (removed: boolean) => void;

  // Reset function
  reset: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

// Helper to safely access sessionStorage
function getStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) return JSON.parse(stored);
  } catch {
    // Ignore parse errors
  }
  return fallback;
}

function storeValue(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null || value === undefined || value === false) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Ignore storage errors
  }
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<ISession | null>(null);
  const [currentPlayer, setCurrentPlayerState] = useState<IPlayer | null>(() =>
    getStoredValue<IPlayer | null>('game_currentPlayer', null)
  );
  const [isHost, setIsHostState] = useState<boolean>(() =>
    getStoredValue<boolean>('game_isHost', false)
  );
  const [leaderboard, setLeaderboard] = useState<IPlayer[]>([]);
  const [gamePhase, setGamePhase] = useState<GameContextType['gamePhase']>('lobby');
  const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
  const [wasRemoved, setWasRemoved] = useState(false);

  // Restore persisted state on mount
  useEffect(() => {
    const storedSessionCode = getStoredValue<string | null>('game_sessionCode', null);

    // If we have a session code, refetch the session data
    if (storedSessionCode) {
      fetch(`/api/session/${storedSessionCode}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setSessionState(data);
        })
        .catch(() => {});
    }
  }, []);

  // Persist key state to sessionStorage
  const setSession = useCallback((s: ISession | null) => {
    setSessionState(s);
    storeValue('game_sessionCode', s?.joinCode ?? null);
  }, []);

  const setCurrentPlayer = useCallback((p: IPlayer | null) => {
    setCurrentPlayerState(p);
    storeValue('game_currentPlayer', p);
    if (p) {
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('currentPlayerId', p.id); // for Pusher removal detection
        } catch {}
      }
    } else {
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem('currentPlayerId');
        } catch {}
      }
    }
  }, []);

  const setIsHost = useCallback((h: boolean) => {
    setIsHostState(h);
    storeValue('game_isHost', h);
  }, []);

  const reset = useCallback(() => {
    setSessionState(null);
    setCurrentPlayerState(null);
    setIsHostState(false);
    setLeaderboard([]);
    setGamePhase('lobby');
    setHasSubmittedAnswer(false);
    setWasRemoved(false);
    // Clear persisted state
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('game_currentPlayer');
        sessionStorage.removeItem('game_isHost');
        sessionStorage.removeItem('game_sessionCode');
        sessionStorage.removeItem('currentPlayerId');
      } catch {}
    }
  }, []);

  const currentQuestion =
    session && session.currentQuestionIndex < session.quiz.questions.length
      ? session.quiz.questions[session.currentQuestionIndex]
      : null;

  return (
    <GameContext.Provider
      value={{
        session,
        setSession,
        currentPlayer,
        setCurrentPlayer,
        isHost,
        setIsHost,
        leaderboard,
        setLeaderboard,
        currentQuestion,
        gamePhase,
        setGamePhase,
        hasSubmittedAnswer,
        setHasSubmittedAnswer,
        wasRemoved,
        setWasRemoved,
        reset,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within GameProvider');
  }
  return context;
}
