import { getCollection, type CollectionEntry } from 'astro:content';

export type LogEntry = CollectionEntry<'logs'>;

type Trade = LogEntry['data']['trades'][number];

export interface PatternStat {
  pattern: string;
  total: number;
  wins: number;
  losses: number;
  holds: number;
  decided: number;
  winRate: number | null;
  avgPnl: number | null;
}

const RESULT_WEIGHT: Record<string, 'win' | 'loss' | 'hold'> = {
  WIN: 'win',
  LOSS: 'loss',
  HOLD: 'hold',
};

export async function getLogsSorted(): Promise<LogEntry[]> {
  const logs = await getCollection('logs');
  return logs.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** 战法胜率榜：只统计有明确 WIN/LOSS 结果的单子，HOLD 不计入胜率分母 */
export function aggregatePatternStats(logs: LogEntry[]): PatternStat[] {
  const map = new Map<
    string,
    { total: number; wins: number; losses: number; holds: number; pnlSum: number; pnlCount: number }
  >();

  for (const log of logs) {
    for (const t of log.data.trades) {
      const s = map.get(t.pattern) ?? {
        total: 0,
        wins: 0,
        losses: 0,
        holds: 0,
        pnlSum: 0,
        pnlCount: 0,
      };
      s.total++;
      const bucket = RESULT_WEIGHT[t.result ?? ''];
      if (bucket === 'win') s.wins++;
      else if (bucket === 'loss') s.losses++;
      else s.holds++;
      if (t.pnl_pct != null) {
        s.pnlSum += t.pnl_pct;
        s.pnlCount++;
      }
      map.set(t.pattern, s);
    }
  }

  return [...map.entries()]
    .map(([pattern, s]) => {
      const decided = s.wins + s.losses;
      return {
        pattern,
        total: s.total,
        wins: s.wins,
        losses: s.losses,
        holds: s.holds,
        decided,
        winRate: decided > 0 ? s.wins / decided : null,
        avgPnl: s.pnlCount > 0 ? s.pnlSum / s.pnlCount : null,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface EquityPoint {
  slug: string;
  date: string;
  net_value: number;
  discipline: number;
  title: string;
  tradeCount: number;
}

export function toEquitySeries(logs: LogEntry[]): EquityPoint[] {
  return logs
    .map((l) => ({
      slug: l.id,
      date: l.data.date.toISOString().slice(0, 10),
      net_value: l.data.net_value,
      discipline: l.data.discipline,
      title: l.data.title,
      tradeCount: l.data.trades.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 某只票在某天的全部交割记录（供 K线卡片打点） */
export async function getTradesFor(code: string, dateISO: string): Promise<Trade[]> {
  const logs = await getCollection('logs');
  const target = new Date(dateISO);
  const log = logs.find(
    (l) => l.data.date.toISOString().slice(0, 10) === target.toISOString().slice(0, 10)
  );
  if (!log) return [];
  return log.data.trades.filter((t) => t.code === code);
}
