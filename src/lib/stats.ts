import { getDb } from '@/db/client';

export interface ReadingStats {
  totalSeconds: number;
  todaySeconds: number;
  weekSeconds: number;
  booksStarted: number;
  booksFinished: number;
  streakDays: number;
  quotes: number;
  bookmarks: number;
}

export interface DayReading {
  /** Local midnight timestamp for the day. */
  day: number;
  seconds: number;
}

function dayStart(offsetDays = 0): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() - offsetDays * 86400000;
}

export async function getReadingStats(): Promise<ReadingStats> {
  const db = await getDb();
  const sum = async (since?: number) => {
    const r = await db.getFirstAsync<{ s: number }>(
      since ? 'SELECT COALESCE(SUM(seconds),0) as s FROM reading_sessions WHERE started_at>=?'
            : 'SELECT COALESCE(SUM(seconds),0) as s FROM reading_sessions',
      since ? [since] : [],
    );
    return r?.s ?? 0;
  };
  const [totalSeconds, todaySeconds, weekSeconds] = await Promise.all([
    sum(), sum(dayStart(0)), sum(dayStart(6)),
  ]);
  const started = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM books WHERE last_read_at IS NOT NULL');
  const finished = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM books WHERE reading_progress >= 0.99');
  const quotes = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM quotes');
  const marks = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM bookmarks');

  // streak: consecutive days with any session (one query, bucketed in JS)
  const recent = await db.getAllAsync<{ started_at: number }>(
    'SELECT started_at FROM reading_sessions WHERE started_at >= ?',
    [dayStart(364)],
  );
  const activeDays = new Set(recent.map((r) => {
    const d = new Date(r.started_at);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }));
  let streakDays = 0;
  for (let d = 0; d < 365; d++) {
    if (activeDays.has(dayStart(d))) streakDays++;
    else if (d > 0) break;
  }
  return {
    totalSeconds, todaySeconds, weekSeconds,
    booksStarted: started?.c ?? 0, booksFinished: finished?.c ?? 0,
    streakDays, quotes: quotes?.c ?? 0, bookmarks: marks?.c ?? 0,
  };
}

/** Per-day reading time for the last N days (oldest → newest), for charts. */
export async function getDailySeries(days = 14): Promise<DayReading[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ started_at: number; seconds: number }>(
    'SELECT started_at, seconds FROM reading_sessions WHERE started_at >= ?',
    [dayStart(days - 1)],
  );
  const buckets = new Map<number, number>();
  for (let d = 0; d < days; d++) buckets.set(dayStart(d), 0);
  for (const r of rows) {
    const d = new Date(r.started_at);
    d.setHours(0, 0, 0, 0);
    const key = d.getTime();
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + (r.seconds ?? 0));
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, seconds]) => ({ day, seconds }));
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m} min`;
  return `${totalSeconds}s`;
}
