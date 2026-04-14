const DEFAULT_TIMEOUT_MS = 5000;

function formatDuration(durationMs: number) {
  return `${Math.round(durationMs)}ms`;
}

export class TimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} exceeded ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new TimeoutError(label, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

export async function measureAsync<T>(label: string, task: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();

  try {
    return await task();
  } finally {
    console.info(`[perf] ${label} completed in ${formatDuration(performance.now() - startedAt)}`);
  }
}

export async function measureWithTimeout<T>(
  label: string,
  task: () => Promise<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  return measureAsync(label, () => withTimeout(task(), label, timeoutMs));
}

export function logCacheHit(label: string) {
  console.info(`[perf] ${label} served from cache`);
}

export const REQUEST_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
