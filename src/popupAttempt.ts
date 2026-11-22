export function nextAttempt(current: number): number {
  return current + 1;
}

export function isCurrentAttempt(started: number, current: number): boolean {
  return started === current;
}
