import { orTimeout, withTimeout } from './timeout';

const never = new Promise<never>(() => undefined);

describe('timeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('withTimeout rejects a promise that does not settle in time, and passes through one that does', async () => {
    const slow = withTimeout(never, 100);
    jest.advanceTimersByTime(100);
    await expect(slow).rejects.toThrow('timeout');
    await expect(withTimeout(Promise.resolve(7), 100)).resolves.toBe(7);
  });

  it('orTimeout falls back on a slow or failing promise', async () => {
    const slow = orTimeout(never, 100, 'fallback');
    jest.advanceTimersByTime(100);
    await expect(slow).resolves.toBe('fallback');
    await expect(orTimeout(Promise.reject(new Error('x')), 100, 'fallback')).resolves.toBe('fallback');
    await expect(orTimeout(Promise.resolve('ok'), 100, 'fallback')).resolves.toBe('ok');
  });
});
