import { getCollection, type CollectionEntry } from 'astro:content';

export type LogEntry = CollectionEntry<'logs'>;
export type Trade = LogEntry['data']['trades'][number];

/** 实盘账户初始参数与 A 股交易费率配置 */
export const ACCOUNT_CONFIG = {
  /** 初始资金（元） */
  initialCapital: 20_000,
  /** 券商佣金费率（双向，万 2.5） */
  commissionRate: 0.00025,
  /** 单笔最低佣金（元） */
  minCommission: 5,
  /** 印花税费率（仅卖出单边收取，千 0.5） */
  stampTaxRate: 0.0005,
  /** A 股最小交易单位（1 手 = 100 股） */
  lotSize: 100,
} as const;

/** 《交易铁律》纪律评分硬性参数（基准 10 分，按违纪项严格扣分） */
export const DISCIPLINE_RULES = {
  baseScore: 10,
  /** R1: 模式外交易每笔扣分 */
  unregisteredPatternPenalty: 3,
  /** R2: 连板高度 < 5 板时允许的最大收盘仓位比例 */
  defensiveMaxPositionPct: 20,
  defensiveMinBoardHeight: 5,
  positionBreachPenalty: 2,
  severePositionPct: 50,
  severePositionBreachPenalty: 3,
  /** R3-A: 单笔亏损超出止损线扣分 */
  stopLossLimitPct: -5,
  stopLossBreachPenalty: 2,
  severeLossLimitPct: -8,
  severeLossBreachPenalty: 3,
  /** R3-B: 浮亏补仓摊平成本扣分 */
  averagingDownPenalty: 3,
  /** R4-A: 单日交易上限与超频每笔扣分 */
  maxDailyTrades: 3,
  overtradingPenaltyPerTrade: 1,
  /** R4-B: 正文逻辑记录最小字符数与缺失扣分 */
  minBodyLength: 40,
  missingLogicPenalty: 2,
} as const;

export interface DisciplineDeduction {
  code: string;
  rule: string;
  points: number;
  reason: string;
}

export interface DisciplineAudit {
  baseScore: number;
  score: number;
  totalDeducted: number;
  grade: '严守纪律' | '轻度偏差' | '纪律松动' | '严重失控';
  deductions: DisciplineDeduction[];
  positionPct: number;
  marketHeight: number;
}

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

export interface HoldingSnapshot {
  code: string;
  name: string;
  shares: number;
  avgCost: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
}

export interface ExecutedTradeDetail {
  trade: Trade;
  shares: number;
  grossAmount: number;
  fee: number;
  realizedPnl: number | null;
}

export interface DailyLedgerSnapshot {
  slug: string;
  date: string;
  title: string;
  /** 按《交易铁律》自动核算的当日纪律分（0–10） */
  discipline: number;
  /** 纪律评分逐项核查明细 */
  disciplineAudit: DisciplineAudit;
  tradeCount: number;
  /** 当日收盘总资产 = 可用现金 + 持仓市值 */
  totalEquity: number;
  /** 当日收盘可用现金 */
  cash: number;
  /** 当日收盘持仓总市值 */
  marketValue: number;
  /** 账户净值 = 总资产 / 初始资金 */
  netValue: number;
  /** 当日盈亏（元） */
  dailyPnl: number;
  /** 当日收益率（%） */
  dailyReturnPct: number;
  /** 累计总盈亏（元） */
  cumulativePnl: number;
  /** 累计总收益率（%） */
  cumulativeReturnPct: number;
  /** 当日已实现盈亏（元） */
  dayRealizedPnl: number;
  /** 当日交易费用（佣金 + 印花税） */
  dayFees: number;
  /** 累计已实现盈亏（元） */
  cumulativeRealizedPnl: number;
  /** 当前持仓浮动盈亏（元） */
  unrealizedPnl: number;
  /** 累计交易费用（元） */
  cumulativeFees: number;
  /** 当日收盘持仓明细 */
  holdings: HoldingSnapshot[];
  /** 当日每笔成交核算明细 */
  executions: ExecutedTradeDetail[];
}

export interface AccountLedger {
  initialCapital: number;
  days: DailyLedgerSnapshot[];
  bySlug: Map<string, DailyLedgerSnapshot>;
  latest: DailyLedgerSnapshot | null;
  avgDiscipline: number | null;
}

export interface EquityPoint {
  slug: string | null;
  date: string;
  totalEquity: number;
  cash: number;
  marketValue: number;
  net_value: number;
  dailyPnl: number;
  dailyReturnPct: number;
  cumulativeReturnPct: number;
  discipline: number | null;
  disciplineGrade: string | null;
  title: string;
  tradeCount: number;
  isInitial?: boolean;
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

/** 获取《战法手册》中所有已登记的合法战法名集合 */
export async function getRegisteredPatterns(): Promise<Set<string>> {
  const playbook = await getCollection('playbook');
  const set = new Set<string>();
  for (const p of playbook) {
    if (p.data.pattern) set.add(p.data.pattern);
    set.add(p.data.title);
  }
  return set;
}

function getDisciplineGrade(score: number): DisciplineAudit['grade'] {
  if (score >= 9) return '严守纪律';
  if (score >= 7) return '轻度偏差';
  if (score >= 4) return '纪律松动';
  return '严重失控';
}

/** 解析仓位百分比字符串，如 "20%" -> 0.2，"2成" -> 0.2 */
function parsePositionPct(position?: string): number | null {
  if (!position) return null;
  const trimmed = position.trim();
  const pctMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pctMatch) return Math.min(1, Math.max(0, Number(pctMatch[1]) / 100));
  const chengMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*成$/);
  if (chengMatch) return Math.min(1, Math.max(0, Number(chengMatch[1]) / 10));
  return null;
}

/** 计算 A 股单笔手续费（佣金 + 卖出印花税） */
export function calcAshareFee(action: 'BUY' | 'SELL', grossAmount: number): number {
  if (grossAmount <= 0) return 0;
  const commission = Math.max(
    ACCOUNT_CONFIG.minCommission,
    grossAmount * ACCOUNT_CONFIG.commissionRate
  );
  const stampTax = action === 'SELL' ? grossAmount * ACCOUNT_CONFIG.stampTaxRate : 0;
  return Number((commission + stampTax).toFixed(2));
}

/**
 * 真实交易账户逐日核算 + 《交易铁律》纪律自动评分引擎：
 * 1. 从初始资金出发，逐日维护现金、持仓股数、加权成本与 A 股税费；
 * 2. 严格依据《交易铁律》R1–R5 核查模式合规、仓位红线、止损与补仓、频率及复盘完整性，输出可追溯的纪律分。
 */
export function computeAccountLedger(
  logs: LogEntry[],
  registeredPatterns: Set<string> = new Set(),
  initialCapital: number = ACCOUNT_CONFIG.initialCapital
): AccountLedger {
  const chronological = [...logs].sort(
    (a, b) => a.data.date.getTime() - b.data.date.getTime()
  );

  let cash = initialCapital;
  let cumulativeRealizedPnl = 0;
  let cumulativeFees = 0;
  let prevEquity = initialCapital;

  interface InternalHolding {
    code: string;
    name: string;
    shares: number;
    avgCost: number;
    marketPrice: number;
  }

  const holdingsMap = new Map<string, InternalHolding>();
  const days: DailyLedgerSnapshot[] = [];
  const bySlug = new Map<string, DailyLedgerSnapshot>();

  for (const log of chronological) {
    const dateStr = log.data.date.toISOString().slice(0, 10);
    const startMarketValue = [...holdingsMap.values()].reduce(
      (sum, h) => sum + h.shares * h.marketPrice,
      0
    );
    const startEquity = cash + startMarketValue;

    let dayRealizedPnl = 0;
    let dayFees = 0;
    const executions: ExecutedTradeDetail[] = [];
    const deductions: DisciplineDeduction[] = [];

    for (const t of log.data.trades) {
      const posPct = parsePositionPct(t.position);

      // R1: 模式铁律核查（必须在《战法手册》中已登记，且不得为模式外乱做）
      const isExplicitOutside = t.pattern.includes('模式外');
      const isRegistered =
        registeredPatterns.size === 0 ? !isExplicitOutside : registeredPatterns.has(t.pattern);
      if (isExplicitOutside || !isRegistered) {
        deductions.push({
          code: 'R1',
          rule: '模式铁律',
          points: DISCIPLINE_RULES.unregisteredPatternPenalty,
          reason: `${t.name} 使用未登记模式「${t.pattern}」`,
        });
      }

      if (t.action === 'BUY') {
        // R3-B: 止损铁律 — 禁止对已有浮亏持仓补仓摊平成本
        const existingBeforeBuy = holdingsMap.get(t.code);
        if (existingBeforeBuy && existingBeforeBuy.shares > 0 && t.price < existingBeforeBuy.avgCost) {
          deductions.push({
            code: 'R3-B',
            rule: '止损铁律（禁止摊平）',
            points: DISCIPLINE_RULES.averagingDownPenalty,
            reason: `${t.name} 浮亏状态（成本 ${existingBeforeBuy.avgCost.toFixed(2)}）在 ${t.price.toFixed(2)} 补仓摊平`,
          });
        }

        let shares = 0;
        let grossAmount = 0;

        if (t.shares != null) {
          shares = t.shares;
          grossAmount = shares * t.price;
        } else {
          const targetAmt =
            t.amount != null
              ? t.amount
              : posPct != null
                ? startEquity * posPct
                : cash;
          const budget = Math.min(targetAmt, Math.max(cash - ACCOUNT_CONFIG.minCommission, 0));
          const lotCost = t.price * ACCOUNT_CONFIG.lotSize;

          if (budget >= lotCost) {
            shares = Math.floor(budget / lotCost) * ACCOUNT_CONFIG.lotSize;
            grossAmount = shares * t.price;
          } else if (budget > 0) {
            shares = Number((budget / t.price).toFixed(4));
            grossAmount = shares * t.price;
          }
        }

        const fee = t.fee ?? calcAshareFee('BUY', grossAmount);
        cash -= grossAmount + fee;
        dayFees += fee;
        cumulativeFees += fee;

        if (shares > 0) {
          const existing = holdingsMap.get(t.code);
          if (existing) {
            const totalShares = existing.shares + shares;
            const totalCost = existing.shares * existing.avgCost + grossAmount + fee;
            existing.shares = totalShares;
            existing.avgCost = totalCost / totalShares;
            existing.marketPrice = t.close_price ?? t.price;
          } else {
            holdingsMap.set(t.code, {
              code: t.code,
              name: t.name,
              shares,
              avgCost: (grossAmount + fee) / shares,
              marketPrice: t.close_price ?? t.price,
            });
          }
        }

        executions.push({
          trade: t,
          shares,
          grossAmount,
          fee,
          realizedPnl: null,
        });
      } else {
        // SELL
        const existing = holdingsMap.get(t.code);
        let realizedPct: number | null = t.pnl_pct ?? null;

        if (existing && existing.shares > 0) {
          let sellShares = existing.shares;
          if (t.shares != null) {
            sellShares = Math.min(t.shares, existing.shares);
          } else if (posPct != null && posPct < 1) {
            const targetSellAmt = startEquity * posPct;
            const estShares =
              Math.floor(targetSellAmt / (t.price * ACCOUNT_CONFIG.lotSize)) *
              ACCOUNT_CONFIG.lotSize;
            if (estShares > 0 && estShares < existing.shares) {
              sellShares = estShares;
            }
          }

          const grossAmount = sellShares * t.price;
          const fee = t.fee ?? calcAshareFee('SELL', grossAmount);
          const costBasis = sellShares * existing.avgCost;
          const realized = grossAmount - fee - costBasis;
          if (realizedPct == null && costBasis > 0) {
            realizedPct = (realized / costBasis) * 100;
          }

          cash += grossAmount - fee;
          dayRealizedPnl += realized;
          cumulativeRealizedPnl += realized;
          dayFees += fee;
          cumulativeFees += fee;

          existing.shares -= sellShares;
          existing.marketPrice = t.close_price ?? t.price;
          if (existing.shares <= 1e-6) {
            holdingsMap.delete(t.code);
          }

          executions.push({
            trade: t,
            shares: sellShares,
            grossAmount,
            fee,
            realizedPnl: realized,
          });
        } else {
          const costBasis =
            t.shares != null
              ? t.shares * (t.pnl_pct != null ? t.price / (1 + t.pnl_pct / 100) : t.price)
              : t.amount != null
                ? t.amount
                : posPct != null
                  ? startEquity * posPct
                  : 0;
          const grossProfit = t.pnl_pct != null ? costBasis * (t.pnl_pct / 100) : 0;
          const grossAmount = costBasis + grossProfit;
          const shares =
            t.shares ?? (t.price > 0 ? Number((grossAmount / t.price).toFixed(2)) : 0);
          const fee = t.fee ?? calcAshareFee('SELL', grossAmount);
          const realized = grossProfit - fee;

          cash += realized;
          dayRealizedPnl += realized;
          cumulativeRealizedPnl += realized;
          dayFees += fee;
          cumulativeFees += fee;

          executions.push({
            trade: t,
            shares,
            grossAmount,
            fee,
            realizedPnl: realized,
          });
        }

        // R3-A: 止损铁律 — 单笔亏损超出防守红线
        if (realizedPct != null && realizedPct < DISCIPLINE_RULES.stopLossLimitPct) {
          const severe = realizedPct < DISCIPLINE_RULES.severeLossLimitPct;
          deductions.push({
            code: 'R3-A',
            rule: '止损铁律（深亏）',
            points: severe
              ? DISCIPLINE_RULES.severeLossBreachPenalty
              : DISCIPLINE_RULES.stopLossBreachPenalty,
            reason: `${t.name} 单笔亏损 ${realizedPct.toFixed(1)}%，超出 ${DISCIPLINE_RULES.stopLossLimitPct}% 止损红线`,
          });
        }
      }
    }

    const holdings: HoldingSnapshot[] = [...holdingsMap.values()].map((h) => {
      const mv = h.shares * h.marketPrice;
      const costTotal = h.shares * h.avgCost;
      const uPnl = mv - costTotal;
      return {
        code: h.code,
        name: h.name,
        shares: h.shares,
        avgCost: h.avgCost,
        marketPrice: h.marketPrice,
        marketValue: mv,
        unrealizedPnl: uPnl,
        unrealizedPnlPct: costTotal > 0 ? (uPnl / costTotal) * 100 : 0,
      };
    });

    const marketValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
    const unrealizedPnl = holdings.reduce((sum, h) => sum + h.unrealizedPnl, 0);
    const totalEquity = cash + marketValue;
    const netValue = totalEquity / initialCapital;
    const dailyPnl = totalEquity - prevEquity;
    const dailyReturnPct = prevEquity > 0 ? (dailyPnl / prevEquity) * 100 : 0;
    const cumulativePnl = totalEquity - initialCapital;
    const cumulativeReturnPct = (cumulativePnl / initialCapital) * 100;
    const positionPct = totalEquity > 0 ? (marketValue / totalEquity) * 100 : 0;

    // R2: 仓位铁律 — 连板高度 < 5 板（默认防守期）时，收盘总仓位不得超过 20%
    const marketHeight = log.data.market_height ?? 4;
    if (
      marketHeight < DISCIPLINE_RULES.defensiveMinBoardHeight &&
      positionPct > DISCIPLINE_RULES.defensiveMaxPositionPct + 0.5
    ) {
      const severe = positionPct > DISCIPLINE_RULES.severePositionPct;
      deductions.push({
        code: 'R2',
        rule: '仓位铁律',
        points: severe
          ? DISCIPLINE_RULES.severePositionBreachPenalty
          : DISCIPLINE_RULES.positionBreachPenalty,
        reason: `连板高度 ${marketHeight} 板（<5板防守期），收盘仓位 ${positionPct.toFixed(1)}% 超出 20% 上限`,
      });
    }

    // R4-A: 频率铁律 — 单日交割超过 3 笔
    if (log.data.trades.length > DISCIPLINE_RULES.maxDailyTrades) {
      const extra = log.data.trades.length - DISCIPLINE_RULES.maxDailyTrades;
      deductions.push({
        code: 'R4-A',
        rule: '频率铁律',
        points: extra * DISCIPLINE_RULES.overtradingPenaltyPerTrade,
        reason: `单日交割 ${log.data.trades.length} 笔，超出上限 ${extra} 笔`,
      });
    }

    // R4-B: 知行合一 — 复盘摘要与正文决策逻辑完整性
    const bodyText = (log.body ?? '').replace(/\s+/g, '');
    if (!log.data.summary.trim() || bodyText.length < DISCIPLINE_RULES.minBodyLength) {
      deductions.push({
        code: 'R4-B',
        rule: '知行合一',
        points: DISCIPLINE_RULES.missingLogicPenalty,
        reason: '复盘摘要缺失或正文决策逻辑记录不足 40 字',
      });
    }

    // R5: 盘中主观违纪自查登记项
    for (const v of log.data.violations ?? []) {
      if (typeof v === 'string') {
        deductions.push({
          code: 'R5',
          rule: '盘中违纪自查',
          points: 1,
          reason: v,
        });
      } else {
        deductions.push({
          code: 'R5',
          rule: v.rule,
          points: v.points,
          reason: v.note ?? v.rule,
        });
      }
    }

    const totalDeducted = deductions.reduce((sum, d) => sum + d.points, 0);
    const computedDiscipline = Math.max(0, DISCIPLINE_RULES.baseScore - totalDeducted);
    const disciplineAudit: DisciplineAudit = {
      baseScore: DISCIPLINE_RULES.baseScore,
      score: computedDiscipline,
      totalDeducted,
      grade: getDisciplineGrade(computedDiscipline),
      deductions,
      positionPct,
      marketHeight,
    };

    const snap: DailyLedgerSnapshot = {
      slug: log.id,
      date: dateStr,
      title: log.data.title,
      discipline: computedDiscipline,
      disciplineAudit,
      tradeCount: log.data.trades.length,
      totalEquity,
      cash,
      marketValue,
      netValue,
      dailyPnl,
      dailyReturnPct,
      cumulativePnl,
      cumulativeReturnPct,
      dayRealizedPnl,
      dayFees,
      cumulativeRealizedPnl,
      unrealizedPnl,
      cumulativeFees,
      holdings,
      executions,
    };

    days.push(snap);
    bySlug.set(log.id, snap);
    prevEquity = totalEquity;
  }

  const avgDiscipline =
    days.length > 0
      ? days.reduce((sum, d) => sum + d.discipline, 0) / days.length
      : null;

  return {
    initialCapital,
    days,
    bySlug,
    latest: days[days.length - 1] ?? null,
    avgDiscipline,
  };
}

/** 便捷异步入口：自动加载日志与《战法手册》合法模式后完成账户与纪律核算 */
export async function getComputedLedger(): Promise<{
  logs: LogEntry[];
  ledger: AccountLedger;
}> {
  const [logs, registeredPatterns] = await Promise.all([
    getLogsSorted(),
    getRegisteredPatterns(),
  ]);
  const ledger = computeAccountLedger(logs, registeredPatterns);
  return { logs, ledger };
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

/** 从初始资金出发，输出每日资金、净值与铁律纪律分序列（含起始本金锚点） */
export function toEquitySeries(
  logs: LogEntry[],
  registeredPatterns: Set<string> = new Set(),
  initialCapital: number = ACCOUNT_CONFIG.initialCapital
): EquityPoint[] {
  const ledger = computeAccountLedger(logs, registeredPatterns, initialCapital);
  if (ledger.days.length === 0) return [];

  const initialPoint: EquityPoint = {
    slug: null,
    date: '初始本金',
    totalEquity: initialCapital,
    cash: initialCapital,
    marketValue: 0,
    net_value: 1.0,
    dailyPnl: 0,
    dailyReturnPct: 0,
    cumulativeReturnPct: 0,
    discipline: null,
    disciplineGrade: null,
    title: `账户初始资金 ¥${initialCapital.toLocaleString('zh-CN')}`,
    tradeCount: 0,
    isInitial: true,
  };

  return [
    initialPoint,
    ...ledger.days.map((d) => ({
      slug: d.slug,
      date: d.date,
      totalEquity: d.totalEquity,
      cash: d.cash,
      marketValue: d.marketValue,
      net_value: d.netValue,
      dailyPnl: d.dailyPnl,
      dailyReturnPct: d.dailyReturnPct,
      cumulativeReturnPct: d.cumulativeReturnPct,
      discipline: d.discipline,
      disciplineGrade: d.disciplineAudit.grade,
      title: d.title,
      tradeCount: d.tradeCount,
    })),
  ];
}

export function formatCurrency(amount: number, showSign = false): string {
  const abs = Math.abs(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (showSign) {
    if (amount > 0) return `+¥${abs}`;
    if (amount < 0) return `-¥${abs}`;
    return `¥${abs}`;
  }
  return amount < 0 ? `-¥${abs}` : `¥${abs}`;
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
