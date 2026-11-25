import { useMemo, useState, useEffect } from 'react';
import { markLabComplete } from '../../lib/progress';

export default function InventorySkewLab() {
  const [inventory, setInventory] = useState(8); // -20 .. +20
  const [sigma, setSigma] = useState(0.6); // volatility
  const [gamma, setGamma] = useState(0.35); // risk aversion
  const [baseHalfSpread, setBaseHalfSpread] = useState(0.15);
  const [touched, setTouched] = useState(false);

  const mid = 100.0;

  const quote = useMemo(() => {
    // Avellaneda-Stoikov inspired reservation price & dynamic spread
    const skew = inventory * gamma * sigma * sigma * 1.4;
    const reservationPrice = mid - skew;
    const dynamicHalfSpread = baseHalfSpread + 0.5 * gamma * sigma * sigma;
    const rawBid = reservationPrice - dynamicHalfSpread;
    const rawAsk = reservationPrice + dynamicHalfSpread;
    // Quantize to 0.05 tick
    const bid = Math.floor(rawBid * 20) / 20;
    const ask = Math.ceil(rawAsk * 20) / 20;

    return { skew, reservationPrice, dynamicHalfSpread, bid, ask };
  }, [inventory, sigma, gamma, baseHalfSpread]);

  useEffect(() => {
    if (touched) markLabComplete('lab-inventory-skew');
  }, [touched]);

  const minP = 98.0;
  const maxP = 102.0;
  const pct = (p: number) => Math.max(2, Math.min(98, ((p - minP) / (maxP - minP)) * 100));

  return (
    <div className="my-8 rounded-2xl border border-violet-500/30 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-violet-500" />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · Avellaneda-Stoikov 库存偏斜报价控制台（Mid = 100.00）
          </span>
        </div>
        <span className="font-mono text-xs text-slate-500">
          库存 q = <strong className={inventory > 0 ? 'text-emerald-500' : inventory < 0 ? 'text-rose-500' : ''}>{inventory > 0 ? `+${inventory}` : inventory}</strong>
        </span>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">当前库存 (q)</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{inventory > 0 ? `+${inventory}` : inventory} 手</span>
            </div>
            <input type="range" min={-20} max={20} step={1} value={inventory} onChange={(e) => { setInventory(Number(e.target.value)); setTouched(true); }} className="w-full accent-emerald-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">市场波动率 (σ)</span>
              <span className="font-mono font-bold text-amber-500">{sigma.toFixed(2)}</span>
            </div>
            <input type="range" min={0.2} max={1.5} step={0.05} value={sigma} onChange={(e) => { setSigma(Number(e.target.value)); setTouched(true); }} className="w-full accent-amber-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">风险厌恶系数 (γ)</span>
              <span className="font-mono font-bold text-violet-500">{gamma.toFixed(2)}</span>
            </div>
            <input type="range" min={0.05} max={1.0} step={0.05} value={gamma} onChange={(e) => { setGamma(Number(e.target.value)); setTouched(true); }} className="w-full accent-violet-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">基础半价差</span>
              <span className="font-mono font-bold text-sky-500">${baseHalfSpread.toFixed(2)}</span>
            </div>
            <input type="range" min={0.05} max={0.5} step={0.05} value={baseHalfSpread} onChange={(e) => { setBaseHalfSpread(Number(e.target.value)); setTouched(true); }} className="w-full accent-sky-500" />
          </label>
        </div>

        {/* Visual Price Axis */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0b1017] p-5">
          <div className="relative h-14">
            <div className="absolute left-0 right-0 top-7 h-1 rounded-full bg-slate-300 dark:bg-slate-800" />
            {/* Mid */}
            <div className="absolute top-1 -translate-x-1/2 flex flex-col items-center" style={{ left: `${pct(mid)}%` }}>
              <span className="text-[10px] font-mono text-slate-400">Mid 100.00</span>
              <span className="h-5 w-0.5 bg-slate-400" />
            </div>
            {/* Reservation */}
            <div className="absolute top-6 -translate-x-1/2 flex flex-col items-center" style={{ left: `${pct(quote.reservationPrice)}%` }}>
              <span className="h-3 w-3 rounded-full bg-violet-500 ring-2 ring-violet-300" />
              <span className="mt-1 text-[10px] font-mono text-violet-500 font-bold">r={quote.reservationPrice.toFixed(2)}</span>
            </div>
            {/* Bid */}
            <div className="absolute top-4 -translate-x-1/2 flex flex-col items-center" style={{ left: `${pct(quote.bid)}%` }}>
              <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-mono font-bold text-white">Bid {quote.bid.toFixed(2)}</span>
            </div>
            {/* Ask */}
            <div className="absolute top-4 -translate-x-1/2 flex flex-col items-center" style={{ left: `${pct(quote.ask)}%` }}>
              <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-mono font-bold text-white">Ask {quote.ask.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 px-4 py-3">
          {inventory > 0 ? (
            <>当前持有 <strong>+{inventory} 手多头库存</strong>：保留价 <code>r</code> 自动下移至 <strong>{quote.reservationPrice.toFixed(2)}</strong>，买单压低减少继续接货，卖单下移吸引对手盘帮你平仓卸货！</>
          ) : inventory < 0 ? (
            <>当前持有 <strong>{inventory} 手空头库存</strong>：保留价 <code>r</code> 自动上移至 <strong>{quote.reservationPrice.toFixed(2)}</strong>，买单抬高加速回补，卖单抬高防止继续加空！</>
          ) : (
            <>当前库存为 0：买卖报价围绕中间价 <code>100.00</code> 严格对称，波动率 <code>σ</code> 越高，报价价差自动拉宽以抵御逆向选择。</>
          )}
        </div>
      </div>
    </div>
  );
}
