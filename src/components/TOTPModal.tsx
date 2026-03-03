'use client';

import { useState } from 'react';
import { Button, Input, Card, Alert } from '@/components/ui';

interface TOTPModalProps {
  onSuccess: () => void;
}

export function TOTPModal({ onSuccess }: TOTPModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = async () => {
    setError('');
    setIsVerifying(true);

    try {
      const response = await fetch('/api/auth/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.valid) {
        onSuccess();
      } else {
        setError(data.error || 'Invalid password. Please try again.');
        setPassword('');
      }
    } catch (err) {
      setError('Error verifying password. Please try again.');
      console.error(err);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleVerify();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md shadow-2xl">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Master Password Required
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Enter your admin password to create a new quiz
          </p>
        </div>

        {error && (
          <Alert variant="error" className="mb-6">
            {error}
          </Alert>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
            Admin Password
          </label>
          <Input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={handleKeyPress}
            className="text-center text-lg"
            disabled={isVerifying}
            autoFocus
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Contact the host/admin if you do not have access.
          </p>
        </div>

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={isVerifying}
          onClick={handleVerify}
          disabled={!password.trim()}
        >
          Verify Password
        </Button>
      </Card>
    </div>
  );
}
