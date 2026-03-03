import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleErrorResponse(error: unknown) {
  console.error('API Error:', error);

  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: error.issues,
      },
      { status: 400 }
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      error: 'An unexpected error occurred',
    },
    { status: 500 }
  );
}

export function successResponse(data: unknown, statusCode = 200) {
  return NextResponse.json(data, { status: statusCode });
}

// Common API errors
export const ApiErrors = {
  QUIZ_NOT_FOUND: new ApiError(404, 'Quiz not found', 'QUIZ_NOT_FOUND'),
  SESSION_NOT_FOUND: new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND'),
  INVALID_CODE: new ApiError(400, 'Invalid join code', 'INVALID_CODE'),
  SESSION_FULL: new ApiError(400, 'Session is full', 'SESSION_FULL'),
  SESSION_NOT_ACTIVE: new ApiError(
    400,
    'Session is not active',
    'SESSION_NOT_ACTIVE'
  ),
  UNAUTHORIZED: new ApiError(401, 'Unauthorized', 'UNAUTHORIZED'),
};
