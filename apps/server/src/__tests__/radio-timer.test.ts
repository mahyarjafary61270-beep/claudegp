import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisconnectTimer, countHumans } from '../modules/radio/manager';

describe('countHumans — the radio bot never counts as a human', () => {
  it('counts only non-bot identities', () => {
    const identities = ['user1', 'radio:ch123', 'user2', 'radio:ch456'];
    expect(countHumans(identities)).toBe(2);
  });

  it('empty room has zero humans', () => {
    expect(countHumans([])).toBe(0);
    expect(countHumans(['radio:ch1'])).toBe(0);
  });
});

describe('DisconnectTimer — 60s auto-disconnect behaviour', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires the callback after the delay', () => {
    const timer = new DisconnectTimer();
    const fn = vi.fn();
    timer.schedule('ch1', 60_000, fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(59_999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(timer.isScheduled('ch1')).toBe(false);
  });

  it('cancel prevents the callback (human rejoined in time)', () => {
    const timer = new DisconnectTimer();
    const fn = vi.fn();
    timer.schedule('ch1', 60_000, fn);
    vi.advanceTimersByTime(30_000);
    timer.cancel('ch1'); // a human rejoined
    vi.advanceTimersByTime(60_000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('re-scheduling replaces the previous timer', () => {
    const timer = new DisconnectTimer();
    const first = vi.fn();
    const second = vi.fn();
    timer.schedule('ch1', 60_000, first);
    vi.advanceTimersByTime(59_000);
    timer.schedule('ch1', 60_000, second); // flapping human resets the clock
    vi.advanceTimersByTime(60_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('tracks independent channels separately', () => {
    const timer = new DisconnectTimer();
    const a = vi.fn();
    const b = vi.fn();
    timer.schedule('chA', 10_000, a);
    timer.schedule('chB', 60_000, b);
    vi.advanceTimersByTime(10_000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50_000);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
