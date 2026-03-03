'use client';

import { useEffect } from 'react';
import { Card, Button, Alert } from '@/components/ui';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global app error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-red-50 to-pink-100 dark:from-slate-900 dark:to-slate-800">
          <Card className="w-full max-w-md shadow-xl">
            <Alert variant="error" className="mb-4">
              <p className="font-semibold">Application error</p>
              <p className="text-sm mt-1">A critical error occurred. Please try again.</p>
            </Alert>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={reset}>
                Retry
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => (window.location.href = '/')}>
                Home
              </Button>
            </div>
          </Card>
        </div>
      </body>
    </html>
  );
}
