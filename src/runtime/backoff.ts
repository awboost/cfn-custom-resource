/**
 * Exponential back-off with configurable base and jitter.
 */
export async function backoff(
  iteration: number,
  baseMs: number,
  jitter = 0.1,
  maxMs = 0x7fffffff,
): Promise<void> {
  let ms = Math.pow(2, iteration) * baseMs * (1 + jitter * Math.random());

  if (maxMs) {
    ms = Math.min(ms, maxMs);
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}
