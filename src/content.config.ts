import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const tradeSchema = z.object({
  code: z.string(),
  name: z.string(),
  pattern: z.string(),
  action: z.enum(['BUY', 'SELL']),
  price: z.number(),
  /** 真实成交股数（如 1000 股）；未填时根据 position 仓位比例按 100 股整数手自动换算 */
  shares: z.number().int().positive().optional(),
  /** 成交金额（可选，优先级次于 shares） */
  amount: z.number().positive().optional(),
  /** 仓位占比字符串（如 "20%"、"30%"） */
  position: z.string().optional(),
  /** 当日收盘估值价（用于持仓盯市计算浮盈浮亏，未填时默认按成交价估值） */
  close_price: z.number().positive().optional(),
  /** 显式手续费+印花税；未填时按 A 股标准费率自动计算 */
  fee: z.number().min(0).optional(),
  result: z.enum(['WIN', 'LOSS', 'HOLD']).optional(),
  pnl_pct: z.number().nullable().optional(),
});

const violationSchema = z.union([
  z.string(),
  z.object({
    rule: z.string(),
    points: z.number().positive().default(1),
    note: z.string().optional(),
  }),
]);

const logs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/logs' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    /** 已由初始资金与每日交割自动计算，保留可选以兼容旧文档 */
    net_value: z.number().optional(),
    /** 已由《交易铁律》评分引擎自动核算，保留可选以兼容旧文档 */
    discipline: z.number().min(0).max(10).optional(),
    /** 当日市场最高连板高度（默认按 < 5 板防守环境处理；>= 5 板视为强势主升环境） */
    market_height: z.number().int().min(0).optional(),
    /** 盘中主观违纪自查登记项（R5） */
    violations: z.array(violationSchema).default([]),
    summary: z.string(),
    trades: z.array(tradeSchema).default([]),
  }),
});

const playbook = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/playbook' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    // 复盘 trades.pattern 填写的战法名，默认等于 title
    pattern: z.string().optional(),
  }),
});

const rules = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/rules' }),
  schema: z.object({
    title: z.string(),
  }),
});

export const collections = { logs, playbook, rules };
