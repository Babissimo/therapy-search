/**
 * Runs the tasks it is given no more than `max` at a time, the rest waiting their turn in the order given. A task whose
 * `signal` aborts before its turn is dropped, rejecting with the signal's reason, so nobody's leftover work is done.
 */
export function limitConcurrency(max: number): <T>(task: () => Promise<T>, signal?: AbortSignal) => Promise<T> {
  let running = 0;
  const waiting: (() => void)[] = [];

  function turn(signal: AbortSignal | undefined): Promise<void> {
    return new Promise((resolve, reject) => {
      const go = () => {
        signal?.removeEventListener("abort", drop);
        resolve();
      };
      const drop = () => {
        waiting.splice(waiting.indexOf(go), 1);
        reject(signal?.reason);
      };
      waiting.push(go);
      signal?.addEventListener("abort", drop, { once: true });
    });
  }

  return async (task, signal) => {
    signal?.throwIfAborted();
    if (running < max) running++;
    // A finishing task hands its place straight on, so none given in the meantime can take it as well.
    else await turn(signal);
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  };
}
