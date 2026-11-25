import React, { useMemo, useState, useEffect } from 'react';
import { markLabComplete } from '../../lib/progress';

export default function PerpetualFundingLab() {
  const [leverage, setLeverage] = useState(10);
  const [markPrice, setMarkPrice] = useState(60000);
  const [fundingBps8h, setFundingBps8h] = useState(3.5); // 0.035% per 8h
  const [holdDays, setHoldDays] = useState(14);
  const [touched, setTouched] = useState(false);

  const entryPrice = 60000;
  const initialMargin = 10000; // $10,000 collateral
  const mmr = 0.005; // 0.5% maintenance margin rate

  const calc = useMemo(() => {
    const notional = initialMargin * leverage;
    const qtyBtc = notional / entryPrice;
    const pricePnl = qtyBtc * (markPrice - entryPrice);
    const periods = holdDays * 3; // 3 funding intervals per day
    const fundingCost = notional * (fundingBps8h / 10000) * periods;
    const equity = initialMargin + pricePnl - fundingCost;
    const maintMargin = qtyBtc * markPrice * mmr;
    const marginRatio = equity > 0 ? (maintMargin / equity) * 100 : 999;
    const liquidated = equity <= maintMargin;

    // Effective liquidation price after cumulative funding drain
    const liqPrice = Math.max(
      0,
      entryPrice * (1 - (initialMargin - fundingCost) / notional + mmr)
    );
    const annualFundingPct = (fundingBps8h / 10000) * 3 * 365 * 100 * leverage;

    return {
      notional,
      pricePnl,
      fundingCost,
      equity,
      maintMargin,
      marginRatio,
      liquidated,
      liqPrice,
      annualFundingPct,
    };
  }, [leverage, markPrice, fundingBps8h, holdDays]);

  useEffect(() => {
    if (touched) markLabComplete('lab-perpetual-funding');
  }, [touched]);

  return (
    <div className="my-8 rounded-2xl border border-sky-500/30 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${calc.liquidated ? 'bg-rose-500 animate-ping' : 'bg-sky-500'}`} />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · 永续合约 PnL、资金费率与强平线滑块（本金 $10,000 做多）
          </span>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-mono font-bold ${calc.liquidated ? 'bg-rose-500 text-white' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}`}>
          {calc.liquidated ? '💥 已触发强平 (LIQUIDATED)' : `强平价 $${calc.liqPrice.toFixed(0)}`}
        </span>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">杠杆倍数</span>
              <span className="font-mono font-bold text-amber-500">{leverage}x</span>
            </div>
            <input type="range" min={1} max={50} step={1} value={leverage} onChange={(e) => { setLeverage(Number(e.target.value)); setTouched(true); }} className="w-full accent-amber-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">当前标记价格</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">${markPrice}</span>
            </div>
            <input type="range" min={52000} max={68000} step={200} value={markPrice} onChange={(e) => { setMarkPrice(Number(e.target.value)); setTouched(true); }} className="w-full accent-sky-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">资金费率 (每 8h)</span>
              <span className="font-mono font-bold text-rose-500">{fundingBps8h.toFixed(1)} bps</span>
            </div>
            <input type="range" min={0} max={10} step={0.5} value={fundingBps8h} onChange={(e) => { setFundingBps8h(Number(e.target.value)); setTouched(true); }} className="w-full accent-rose-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">持仓天数</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{holdDays} 天</span>
            </div>
            <input type="range" min={1} max={90} step={1} value={holdDays} onChange={(e) => { setHoldDays(Number(e.target.value)); setTouched(true); }} className="w-full accent-emerald-500" />
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] text-slate-500">名义仓位</div>
            <div className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-white">${calc.notional.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] text-slate-500">价格方向盈亏</div>
            <div className={`mt-1 font-mono text-base font-bold ${calc.pricePnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {calc.pricePnl >= 0 ? '+' : ''}${calc.pricePnl.toFixed(0)}
            </div>
          </div>
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 p-3">
            <div className="text-[11px] text-rose-600 dark:text-rose-300">累计资金费支出</div>
            <div className="mt-1 font-mono text-base font-bold text-rose-600 dark:text-rose-400">
              -${calc.fundingCost.toFixed(0)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] text-slate-500">净账户权益</div>
            <div className={`mt-1 font-mono text-base font-bold ${calc.equity > calc.maintMargin ? 'text-slate-900 dark:text-white' : 'text-rose-500'}`}>
              ${calc.equity.toFixed(0)}
            </div>
          </div>
        </div>

        <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${calc.liquidated ? 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200' : 'border-sky-500/30 bg-sky-500/8 text-slate-700 dark:text-slate-200'}`}>
          当前 <strong>{leverage}x</strong> 杠杆下，单是资金费率折合到你的本金年化侵蚀就高达{' '}
          <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{calc.annualFundingPct.toFixed(0)}%/年</span>。
          即使标的价格横盘不动，持仓 {holdDays} 天后强平价也会被资金费率悄悄推高到{' '}
          <span className="font-mono font-bold">${calc.liqPrice.toFixed(0)}</span>！
        </div>
      </div>
    </div>
  );
}
