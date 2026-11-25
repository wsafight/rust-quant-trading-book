import React, { useMemo, useState } from 'react';
import { markLabComplete } from '../../lib/progress';

interface Stall {
  label: string;
  price: number;
  qty: number;
}

const INITIAL_ASKS: Stall[] = [
  { label: '卖一（最便宜摊位）', price: 100.1, qty: 8 },
  { label: '卖二', price: 100.2, qty: 15 },
  { label: '卖三', price: 100.5, qty: 25 },
  { label: '卖四', price: 100.9, qty: 40 },
];

const INITIAL_BIDS: Stall[] = [
  { label: '买一（最高出价买家）', price: 100.0, qty: 12 },
  { label: '买二', price: 99.9, qty: 20 },
  { label: '买三', price: 99.6, qty: 30 },
];

export default function MarketBasicsLab() {
  const [orderMode, setOrderMode] = useState<'market' | 'limit'>('market');
  const [buyQty, setBuyQty] = useState(30);
  const [limitPrice, setLimitPrice] = useState(100.0);

  const result = useMemo(() => {
    if (orderMode === 'limit') {
      if (limitPrice < INITIAL_ASKS[0].price) {
        return {
          filled: 0,
          remaining: buyQty,
          avgPrice: null as number | null,
          fills: [] as Array<{ label: string; price: number; taken: number }>,
          statusText: `你挂了「最多出 ${limitPrice.toFixed(1)} 元」的限价单，但最便宜的卖家也要 ${INITIAL_ASKS[0].price.toFixed(1)} 元——所以你不会立刻买到，而是排进左边买家队列慢慢等。`,
        };
      }
      let rem = buyQty;
      let cost = 0;
      const fills: Array<{ label: string; price: number; taken: number }> = [];
      for (const s of INITIAL_ASKS) {
        if (rem <= 0 || s.price > limitPrice) break;
        const taken = Math.min(rem, s.qty);
        fills.push({ label: s.label, price: s.price, taken });
        cost += taken * s.price;
        rem -= taken;
      }
      const filled = buyQty - rem;
      return {
        filled,
        remaining: rem,
        avgPrice: filled > 0 ? cost / filled : null,
        fills,
        statusText:
          rem > 0
            ? `只买到了 ${filled} 斤（不高于你的限价 ${limitPrice.toFixed(1)} 元），剩下 ${rem} 斤因为卖家太贵自动停手排队。`
            : `全部 ${filled} 斤都在你的最高出价 ${limitPrice.toFixed(1)} 元以内买齐了！`,
      };
    }

    // Market order: sweep asks
    let rem = buyQty;
    let cost = 0;
    const fills: Array<{ label: string; price: number; taken: number }> = [];
    for (const s of INITIAL_ASKS) {
      if (rem <= 0) break;
      const taken = Math.min(rem, s.qty);
      fills.push({ label: s.label, price: s.price, taken });
      cost += taken * s.price;
      rem -= taken;
    }
    const filled = buyQty - rem;
    const avg = filled > 0 ? cost / filled : null;
    const extraPerUnit = avg ? avg - INITIAL_ASKS[0].price : 0;
    return {
      filled,
      remaining: rem,
      avgPrice: avg,
      fills,
      statusText:
        fills.length > 1
          ? `你一口气吃穿了 ${fills.length} 个卖家摊位！平均每斤花了 ${avg?.toFixed(2)} 元，比最便宜摊位贵了 +${extraPerUnit.toFixed(2)} 元/斤。`
          : `数量不大，只买走了「卖一」摊位里的 ${filled} 斤，均价稳稳停在 ${avg?.toFixed(2)} 元。`,
    };
  }, [orderMode, buyQty, limitPrice]);

  const touch = () => markLabComplete('00a-market-basics');

  return (
    <div className="my-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1621] p-5 sm:p-6 shadow-sm space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="inline-block rounded-md bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/25 px-2 py-0.5 text-[11px] font-semibold mb-1">
            交互体验台 · 菜市场撮合
          </span>
          <h3 className="text-base font-bold text-slate-900 dark:text-white m-0!">
            亲自试一次：排队等低价（限价） vs 立刻抢货（市价）
          </h3>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              setOrderMode('market');
              touch();
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer border transition-colors ${
              orderMode === 'market'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            市价单（立刻买齐）
          </button>
          <button
            type="button"
            onClick={() => {
              setOrderMode('limit');
              touch();
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer border transition-colors ${
              orderMode === 'limit'
                ? 'bg-sky-600 text-white border-sky-600'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            限价单（封顶出价）
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4">
        <label className="block space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-300 font-medium">你想买多少斤苹果？</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{buyQty} 斤</span>
          </div>
          <input
            type="range"
            min={5}
            max={70}
            step={5}
            value={buyQty}
            onChange={(e) => {
              setBuyQty(Number(e.target.value));
              touch();
            }}
            className="w-full accent-emerald-600 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>5 斤（轻松买下）</span>
            <span>60 斤（一路吃穿）</span>
          </div>
        </label>

        {orderMode === 'limit' ? (
          <label className="block space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300 font-medium">你能接受的最高单价</span>
              <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
                {limitPrice.toFixed(1)} 元/斤
              </span>
            </div>
            <input
              type="range"
              min={99.8}
              max={100.6}
              step={0.1}
              value={limitPrice}
              onChange={(e) => {
                setLimitPrice(Number(e.target.value));
                touch();
              }}
              className="w-full accent-sky-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>99.8（慢慢排队）</span>
              <span>100.6（愿意多付点）</span>
            </div>
          </label>
        ) : (
          <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            当前是<strong className="mx-1 text-slate-800 dark:text-slate-200">市价单</strong>：不设价格上限，交易所会按「卖一 → 卖二 → 卖三」从便宜到贵把货全部扫给你。
          </div>
        )}
      </div>

      {/* Two-column market board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3.5 space-y-2">
          <div className="font-semibold text-emerald-700 dark:text-emerald-300">
            左边：排队等低价的买家（买盘）
          </div>
          {INITIAL_BIDS.map((b) => (
            <div key={b.label} className="flex justify-between items-center rounded-lg bg-white/70 dark:bg-slate-900/60 px-2.5 py-1.5 font-mono">
              <span className="text-slate-600 dark:text-slate-300 font-sans">{b.label}</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                {b.price.toFixed(1)} 元 · {b.qty} 斤
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3.5 space-y-2">
          <div className="font-semibold text-rose-700 dark:text-rose-300">
            右边：挂牌卖货的摊主（卖盘）
          </div>
          {INITIAL_ASKS.map((a) => {
            const hit = result.fills.find((f) => f.label === a.label);
            return (
              <div
                key={a.label}
                className={`flex justify-between items-center rounded-lg px-2.5 py-1.5 font-mono transition-colors ${
                  hit
                    ? 'bg-rose-500/20 border border-rose-500/40'
                    : 'bg-white/70 dark:bg-slate-900/60'
                }`}
              >
                <span className="text-slate-700 dark:text-slate-200 font-sans">{a.label}</span>
                <span className="text-rose-600 dark:text-rose-400 font-bold">
                  {a.price.toFixed(1)} 元 · 剩 {a.qty - (hit?.taken ?? 0)}/{a.qty} 斤
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary Banner */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 p-4 space-y-2">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-[11px] text-slate-500">立刻买到</div>
            <div className="font-mono text-lg font-bold text-slate-900 dark:text-white">
              {result.filled} 斤
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">实际成交均价</div>
            <div className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {result.avgPrice ? `${result.avgPrice.toFixed(2)} 元` : '排队中'}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">仍在排队</div>
            <div className="font-mono text-lg font-bold text-amber-600 dark:text-amber-400">
              {result.remaining} 斤
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed m-0! pt-2 border-t border-slate-200/70 dark:border-slate-800">
          {result.statusText}
        </p>
      </div>
    </div>
  );
}
