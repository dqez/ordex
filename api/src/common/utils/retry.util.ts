export function jitterBackoff(attempt: number): number {
  const base = 10 * Math.pow(2, attempt);
  return base + Math.random() * base;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
