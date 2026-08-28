// Run an async function over a list with a ceiling on how many run at once.
//
// The obvious version of this is a loop over slices with a Promise.all per
// slice, and it is wrong in a way that only shows up under a deadline: a slice
// is a barrier, so nothing in the next one starts until the slowest call in the
// current one finishes. Refreshing twelve bank connections six at a time, one
// institution taking twenty seconds leaves five workers idle and six items
// untouched for those twenty seconds.
//
// Here the ceiling is a number of workers pulling from a shared cursor instead.
// A slow call occupies one worker; every other worker moves on to the next item.
//
// Pure, and importing nothing: no Supabase, no Plaid, no env. It is used from
// edge handlers and has to stay testable outside one.
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  if (items.length === 0) return out;
  // Results are written by index, so they come back in the caller's order no
  // matter which worker finished first. A caller pairing results with inputs
  // positionally is then correct by construction rather than by luck.
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  const workers = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return out;
}
