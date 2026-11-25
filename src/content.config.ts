import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const tradeSchema = z.object({
  code: z.string(),
  name: z.string(),
  pattern: z.string(),
  action: z.enum(['BUY', 'SELL']),
  price: z.number(),
  position: z.string().optional(),
  result: z.enum(['WIN', 'LOSS', 'HOLD']).optional(),
  pnl_pct: z.number().nullable().optional(),
});

const logs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/logs' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    net_value: z.number(),
    discipline: z.number().min(0).max(10),
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
