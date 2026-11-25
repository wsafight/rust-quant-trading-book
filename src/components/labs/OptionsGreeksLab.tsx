import React, { useMemo, useState } from 'react';
import { markLabComplete } from '../../lib/progress';

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

export default function OptionsGreeksLab() {
  const [spot, setSpot] = useState(100);
  const [strike] = useState(100);
  const [ivPct, setIvPct] = useState(45);
  const [daysToExpiry, setDaysToExpiry] = useState(14);
  const [shortPosition, setShortPosition] = useState(true);

  const touch = () => markLabComplete('lab-20-options-greeks');

  const bs = useMemo(() => {
    const t = Math.max(0.5, daysToExpiry) / 365;
    const sigma = ivPct / 100;
    const sqrtT = Math.sqrt(t);
    const d1 = (Math.log(spot / strike) + 0.5 * sigma * sigma * t) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;

    const callPrice = spot * normCdf(d1) - strike * normCdf(d2);
    const delta = normCdf(d1);
    const gamma = normPdf(d1) / (spot * sigma * sqrtT);
    const vega = (spot * normPdf(d1) * sqrtT) / 100; // per 1% IV
    const theta = -(spot * normPdf(d1) * sigma) / (2 * sqrtT) / 365; // per day

    // Compare against initial ATM entry at S=100, IV=45%, DTE=14 (Delta-hedged at entry: delta0 ~= 0.52)
    const t0 = 14 / 365;
    const s0 = 100;
    const sig0 = 0.45;
    const d1_0 = (0.5 * sig0 * sig0 * t0) / (sig0 * Math.sqrt(t0));
    const d2_0 = d1_0 - sig0 * Math.sqrt(t0);
    const entryCall = s0 * normCdf(d1_0) - strike * normCdf(d2_0);
    const entryDelta = normCdf(d1_0);

    const sign = shortPosition ? -1 : 1;
    // Delta-hedged portfolio at entry: sign * (Call(S) - Call(100)) - sign * entryDelta * (S - 100)
    const hedgedPnl = sign * (callPrice - entryCall) - sign * entryDelta * (spot - s0);

    return {
      callPrice,
      delta: sign * delta,
      gamma: sign * gamma,
      vega: sign * vega,
      theta: sign * theta,
      hedgedPnl,
      neededHedgeDelta: -sign * (delta - entryDelta),
    };
  }, [spot, strike, ivPct, daysToExpiry, shortPosition]);

  return (
    <div className="my-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1621] p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
            交互实验室 · Black-Scholes 希腊字母与 Delta-Gamma 对冲台
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            平值看涨期权（Strike = 100）在开仓时已完成初始 Delta 对冲。拖动标的价格 S，亲眼体验 Short Gamma“涨跌都亏” vs 每天赚 Theta 的权衡。
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-semibold">
          <button
            type="button"
            onClick={() => { setShortPosition(true); touch(); }}
            className={`px-3 py-1.5 cursor-pointer ${shortPosition ? 'bg-rose-500 text-white' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}
          >
            Short Call（卖方收 Theta）
          </button>
          <button
            type="button"
            onClick={() => { setShortPosition(false); touch(); }}
            className={`px-3 py-1.5 cursor-pointer ${!shortPosition ? 'bg-emerald-600 text-white' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}
          >
            Long Call（买方享 Gamma）
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <label className="block rounded-xl border border-slate-200/80 dark:border-slate-800 p-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 dark:text-slate-300">标的价格 (Spot S)</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">${spot}</span>
          </div>
          <input type="range" min={75} max={125} step={1} value={spot} onChange={(e) => { setSpot(Number(e.target.value)); touch(); }} className="w-full accent-emerald-500" />
        </label>

        <label className="block rounded-xl border border-slate-200/80 dark:border-slate-800 p-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 dark:text-slate-300">隐含波动率 (IV)</span>
            <span className="font-mono font-bold text-sky-600 dark:text-sky-400">{ivPct}%</span>
          </div>
          <input type="range" min={15} max={100} step={1} value={ivPct} onChange={(e) => { setIvPct(Number(e.target.value)); touch(); }} className="w-full accent-sky-500" />
        </label>

        <label className="block rounded-xl border border-slate-200/80 dark:border-slate-800 p-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 dark:text-slate-300">剩余到期天数 (DTE)</span>
            <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{daysToExpiry} 天</span>
          </div>
          <input type="range" min={1} max={30} step={1} value={daysToExpiry} onChange={(e) => { setDaysToExpiry(Number(e.target.value)); touch(); }} className="w-full accent-amber-500" />
        </label>
      </div>

      {/* Greeks Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 p-3">
          <div className="text-[11px] text-slate-500">期权理论价</div>
          <div className="mt-1 font-mono text-lg font-bold text-slate-800 dark:text-slate-100">${bs.callPrice.toFixed(2)}</div>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 p-3">
          <div className="text-[11px] text-slate-500">Delta (Δ)</div>
          <div className="mt-1 font-mono text-lg font-bold text-sky-600 dark:text-sky-400">{bs.delta.toFixed(3)}</div>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 p-3">
          <div className="text-[11px] text-slate-500">Gamma (Γ)</div>
          <div className={`mt-1 font-mono text-lg font-bold ${bs.gamma >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {bs.gamma.toFixed(4)}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 p-3">
          <div className="text-[11px] text-slate-500">Theta (Θ/天)</div>
          <div className={`mt-1 font-mono text-lg font-bold ${bs.theta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {bs.theta >= 0 ? `+$${bs.theta.toFixed(2)}` : `-$${Math.abs(bs.theta).toFixed(2)}`}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 p-3">
          <div className="text-[11px] text-slate-500">Vega (ν/1%IV)</div>
          <div className={`mt-1 font-mono text-lg font-bold ${bs.vega >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {bs.vega >= 0 ? `+$${bs.vega.toFixed(2)}` : `-$${Math.abs(bs.vega).toFixed(2)}`}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div>
          <span className="text-slate-500">Delta 初始对冲后的组合净 PnL：</span>
          <strong className={`font-mono text-base ml-1 ${bs.hedgedPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {bs.hedgedPnl >= 0 ? `+$${bs.hedgedPnl.toFixed(2)}` : `-$${Math.abs(bs.hedgedPnl).toFixed(2)}`}
          </strong>
        </div>
        <div className="font-mono text-slate-600 dark:text-slate-300">
          需补对冲现货：
          <span className="font-bold text-amber-600 dark:text-amber-400 ml-1">
            {bs.neededHedgeDelta >= 0 ? `买入 +${bs.neededHedgeDelta.toFixed(2)}` : `卖出 ${bs.neededHedgeDelta.toFixed(2)}`} 份标的
          </span>
        </div>
      </div>
    </div>
  );
}
