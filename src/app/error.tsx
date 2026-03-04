'use client';

import { useEffect } from 'react';
import { Button, Card, Alert } from '@/components/ui';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App route error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-red-50 to-pink-100 dark:from-slate-900 dark:to-slate-800 animate-fade-in">
      <Card className="w-full max-w-md shadow-xl animate-scale-in animate-pop-in">
        <Alert variant="error" className="mb-4 animate-slide-up">
          <p className="font-semibold">Something went wrong</p>
          <p className="text-sm mt-1">An unexpected error occurred while loading this page.</p>
        </Alert>
        <div className="flex gap-2 animate-slide-up animate-delay-100">
          <Button variant="secondary" className="flex-1" onClick={reset}>
            Try Again
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => (window.location.href = '/')}>
            Go Home
          </Button>
        </div>
      </Card>
    </div>
  );
}
