import { useMemo, useState, useEffect } from 'react';
import { markLabComplete } from '../../lib/progress';

interface BookLevel {
  price: number;
  qty: number;
}

const NORMAL_ASKS: BookLevel[] = [
  { price: 100.1, qty: 8 },
  { price: 100.2, qty: 14 },
  { price: 100.3, qty: 22 },
  { price: 100.5, qty: 30 },
  { price: 100.8, qty: 36 },
];

const NORMAL_BIDS: BookLevel[] = [
  { price: 100.0, qty: 10 },
  { price: 99.9, qty: 16 },
  { price: 99.8, qty: 20 },
  { price: 99.6, qty: 28 },
  { price: 99.3, qty: 36 },
];

const THIN_ASKS: BookLevel[] = [
  { price: 100.3, qty: 3 },
  { price: 100.7, qty: 5 },
  { price: 101.2, qty: 9 },
  { price: 102.0, qty: 14 },
  { price: 103.5, qty: 20 },
];

const THIN_BIDS: BookLevel[] = [
  { price: 99.7, qty: 4 },
  { price: 99.3, qty: 6 },
  { price: 98.8, qty: 8 },
  { price: 98.0, qty: 12 },
  { price: 96.5, qty: 18 },
];

export default function OrderBookLab() {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderQty, setOrderQty] = useState<number>(32);
  const [regime, setRegime] = useState<'normal' | 'thin'>('normal');
  const [labCleared, setLabCleared] = useState(false);

  const asks = regime === 'normal' ? NORMAL_ASKS : THIN_ASKS;
  const bids = regime === 'normal' ? NORMAL_BIDS : THIN_BIDS;

  const bestBid = bids[0].price;
  const bestAsk = asks[0].price;
  const mid = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;
  const spreadBps = (spread / mid) * 10000;

  const sim = useMemo(() => {
    const bookSide = side === 'buy' ? asks : bids;
    let remaining = orderQty;
    let totalNotional = 0;
    let filledQty = 0;
    let levelsSwept = 0;

    const consumedByPrice = new Map<number, number>();

    for (const lvl of bookSide) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, lvl.qty);
      if (take > 0) {
        consumedByPrice.set(lvl.price, take);
        totalNotional += take * lvl.price;
        filledQty += take;
        remaining -= take;
        levelsSwept += 1;
      }
    }

    const vwap = filledQty > 0 ? totalNotional / filledQty : 0;
    const touchPrice = side === 'buy' ? bestAsk : bestBid;
    const sign = side === 'buy' ? 1 : -1;
    const slippageVsMidBps = filledQty > 0 ? (sign * (vwap - mid) / mid) * 10000 : 0;
    const impactVsTouchBps = filledQty > 0 ? (sign * (vwap - touchPrice) / touchPrice) * 10000 : 0;
    const extraDollarCost = filledQty > 0 ? sign * (vwap - mid) * filledQty : 0;

    return {
      consumedByPrice,
      filledQty,
      unfilledQty: remaining,
      vwap,
      levelsSwept,
      slippageVsMidBps,
      impactVsTouchBps,
      extraDollarCost,
    };
  }, [side, orderQty, asks, bids, mid, bestAsk, bestBid]);

  useEffect(() => {
    if (sim.levelsSwept >= 3 && !labCleared) {
      setLabCleared(true);
      markLabComplete('lab-order-book');
    }
  }, [sim.levelsSwept, labCleared]);

  const maxLevelQty = Math.max(...asks.map((a) => a.qty), ...bids.map((b) => b.qty));

  return (
    <div className="my-8 rounded-2xl border border-emerald-500/30 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      {/* Lab Top Bar */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · L2 订单簿与盘口冲击沙盒
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRegime('normal')}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              regime === 'normal'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            正常流动性
          </button>
          <button
            type="button"
            onClick={() => setRegime('thin')}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              regime === 'thin'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            极端行情（盘口变薄）
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="p-5 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/30 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex rounded-xl bg-slate-200/70 dark:bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => setSide('buy')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                side === 'buy'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              市价买入（吃 Ask）
            </button>
            <button
              type="button"
              onClick={() => setSide('sell')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                side === 'sell'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              市价卖出（砸 Bid）
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {[
              { label: '小单 5', qty: 5 },
              { label: '中单 25', qty: 25 },
              { label: '大单 60', qty: 60 },
              { label: '砸穿 105', qty: 105 },
            ].map((p) => (
              <button
                key={p.qty}
                type="button"
                onClick={() => setOrderQty(p.qty)}
                className={`rounded-lg px-2.5 py-1 font-mono transition-colors cursor-pointer border ${
                  orderQty === p.qty
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-600 dark:text-slate-400">
              拖动市价单数量（观察吃穿几档）：
            </span>
            <span className="font-mono font-bold text-base text-slate-900 dark:text-white tabular-nums">
              {orderQty} 手
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={120}
            value={orderQty}
            onChange={(e) => setOrderQty(Number(e.target.value))}
            className="w-full accent-emerald-500 cursor-pointer"
          />
        </div>
      </div>

      {/* Main Split: Order Book Depth + Live Impact Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-[1.25fr_1fr] divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
        {/* Left: L2 Depth Ladder */}
        <div className="p-5 font-mono text-xs space-y-1.5">
          <div className="flex justify-between text-[11px] text-slate-400 pb-1 border-b border-slate-200/70 dark:border-slate-800">
            <span>价格 (Price)</span>
            <span>档位深度 &amp; 吃单量</span>
          </div>

          {/* Asks (highest to lowest) */}
          {[...asks].reverse().map((lvl) => {
            const consumed = side === 'buy' ? (sim.consumedByPrice.get(lvl.price) ?? 0) : 0;
            const totalPct = (lvl.qty / maxLevelQty) * 100;
            const consumedPct = (consumed / maxLevelQty) * 100;
            return (
              <div
                key={`ask-${lvl.price}`}
                className={`relative flex items-center justify-between rounded-md px-2.5 py-1.5 overflow-hidden transition-colors ${
                  consumed > 0
                    ? 'ring-1 ring-rose-500/60 bg-rose-500/8'
                    : 'bg-slate-100/50 dark:bg-slate-900/50'
                }`}
              >
                <div
                  className="absolute inset-y-0 right-0 bg-rose-500/15 transition-all duration-200"
                  style={{ width: `${totalPct}%` }}
                />
                {consumed > 0 && (
                  <div
                    className="absolute inset-y-0 right-0 bg-rose-500/45 transition-all duration-200"
                    style={{ width: `${consumedPct}%` }}
                  />
                )}
                <span className="relative z-10 font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                  {lvl.price.toFixed(2)}
                </span>
                <span className="relative z-10 flex items-center gap-2 tabular-nums">
                  {consumed > 0 && (
                    <span className="rounded bg-rose-600 text-white px-1.5 py-0.5 text-[10px] font-bold">
                      吃掉 {consumed}
                    </span>
                  )}
                  <span className="text-slate-700 dark:text-slate-300 w-10 text-right">
                    {lvl.qty}
                  </span>
                </span>
              </div>
            );
          })}

          {/* Spread Banner */}
          <div className="my-2 flex items-center justify-between rounded-lg bg-slate-200/70 dark:bg-slate-800/90 px-3 py-1.5 text-[11px]">
            <span className="text-slate-600 dark:text-slate-300">
              Mid <strong className="text-slate-900 dark:text-white">{mid.toFixed(2)}</strong>
            </span>
            <span className="text-amber-700 dark:text-amber-300 font-semibold tabular-nums">
              Spread {spread.toFixed(2)} ({spreadBps.toFixed(1)} bps)
            </span>
          </div>

          {/* Bids (highest to lowest) */}
          {bids.map((lvl) => {
            const consumed = side === 'sell' ? (sim.consumedByPrice.get(lvl.price) ?? 0) : 0;
            const totalPct = (lvl.qty / maxLevelQty) * 100;
            const consumedPct = (consumed / maxLevelQty) * 100;
            return (
              <div
                key={`bid-${lvl.price}`}
                className={`relative flex items-center justify-between rounded-md px-2.5 py-1.5 overflow-hidden transition-colors ${
                  consumed > 0
                    ? 'ring-1 ring-emerald-500/60 bg-emerald-500/8'
                    : 'bg-slate-100/50 dark:bg-slate-900/50'
                }`}
              >
                <div
                  className="absolute inset-y-0 right-0 bg-emerald-500/15 transition-all duration-200"
                  style={{ width: `${totalPct}%` }}
                />
                {consumed > 0 && (
                  <div
                    className="absolute inset-y-0 right-0 bg-emerald-500/45 transition-all duration-200"
                    style={{ width: `${consumedPct}%` }}
                  />
                )}
                <span className="relative z-10 font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {lvl.price.toFixed(2)}
                </span>
                <span className="relative z-10 flex items-center gap-2 tabular-nums">
                  {consumed > 0 && (
                    <span className="rounded bg-emerald-600 text-white px-1.5 py-0.5 text-[10px] font-bold">
                      砸掉 {consumed}
                    </span>
                  )}
                  <span className="text-slate-700 dark:text-slate-300 w-10 text-right">
                    {lvl.qty}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Right: Real-time Impact Readout */}
        <div className="p-5 flex flex-col justify-between gap-4 bg-slate-50/40 dark:bg-slate-900/20">
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              实时成交归因
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-3">
                <div className="text-[11px] text-slate-500">成交均价 (VWAP)</div>
                <div className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                  {sim.vwap.toFixed(3)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-3">
                <div className="text-[11px] text-slate-500">穿透档位数</div>
                <div className="mt-1 font-mono text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {sim.levelsSwept} / 5 档
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">相对中间价总滑点</span>
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                  +{sim.slippageVsMidBps.toFixed(1)} bps
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">其中：吃穿盘口冲击</span>
                <span className="font-mono font-semibold text-amber-700 dark:text-amber-300 tabular-nums">
                  +{sim.impactVsTouchBps.toFixed(1)} bps
                </span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-rose-500/20">
                <span className="text-slate-600 dark:text-slate-300">相对 Mid 多付成本</span>
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                  ${sim.extraDollarCost.toFixed(2)}
                </span>
              </div>
            </div>

            {sim.unfilledQty > 0 && (
              <div className="rounded-xl border border-rose-500/50 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
                <strong>流动性耗尽！</strong> 五档全部吃完后仍有{' '}
                <span className="font-mono font-bold">{sim.unfilledQty} 手</span>{' '}
                未成交。实盘里这部分会被砸到更离谱的价格，或触发市价保护拒单。
              </div>
            )}
          </div>

          <div className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-3">
            {regime === 'thin'
              ? '极端行情下，表面上只看 Mid 还在 100 附近，但五档深度萎缩一半以上，同样一笔大单的冲击成本直接翻数倍。'
              : '试试把订单量从 5 手拉到 60 手，再点右上角「极端行情」——感受为什么“只看买一卖一”会严重低估真实执行成本。'}
          </div>
        </div>
      </div>
    </div>
  );
}
