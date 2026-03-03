// Scoring logic for the quiz game
const BASE_POINTS = 1000;
const SPEED_BONUS_MULTIPLIER = 0.5; // Bonus points based on speed

export function calculatePoints(
  isCorrect: boolean,
  timeTaken: number,
  timerSeconds: number
): number {
  if (!isCorrect) return 0;

  // Base points for correct answer
  const points = BASE_POINTS;

  // Speed bonus: more points if answered faster
  // Maximum bonus at 1/3 of max time, no bonus at max time
  const timeRatio = Math.min(timeTaken / (timerSeconds * 1000), 1);
  const speedBonus = Math.max(0, (1 - timeRatio) * BASE_POINTS * SPEED_BONUS_MULTIPLIER);

  return Math.round(points + speedBonus);
}

// Generate a random 6-character join code
export function generateJoinCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Check if a code is valid format
export function isValidCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}

// Verify that exactly one choice per question is marked as correct
export function validateQuestionChoices(choices: { isCorrect: boolean }[]): boolean {
  const correctCount = choices.filter((c) => c.isCorrect).length;
  return correctCount === 1;
}
