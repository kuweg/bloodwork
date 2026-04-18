/** Run `worker` over `items` with at most `limit` promises in flight at once. */
export async function pool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const active = new Set<Promise<void>>();
  for (const item of items) {
    const task = worker(item).finally(() => {
      active.delete(task);
    });
    active.add(task);
    if (active.size >= limit) {
      await Promise.race(active);
    }
  }
  await Promise.all(active);
}
