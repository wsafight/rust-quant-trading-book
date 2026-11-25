import { useMemo, useState } from 'react';
import { markLabComplete } from '../../lib/progress';

export default function PairsArbLab() {
  const [entryZ, setEntryZ] = useState(2.0);
  const [exitZ, setExitZ] = useState(0.4);
  const [regimeBreak, setRegimeBreak] = useState(false);
  const [leggingFail, setLeggingFail] = useState(false);

  const touch = () => markLabComplete('lab-18-pairs-arb');

  const sim = useMemo(() => {
    // Deterministic 40-step spread path (mean-reverting normally, structural drift if regimeBreak)
    const steps = 40;
    const zSeries: number[] = [];
    let z = 0;
    for (let i = 0; i < steps; i++) {
      const wave = Math.sin(i * 0.42) * 1.45 + Math.cos(i * 0.23) * 1.15;
      const drift = regimeBreak && i >= 18 ? (i - 17) * 0.24 : 0;
      z = Number((wave + drift).toFixed(2));
      zSeries.push(z);
    }

    let pos = 0; // -1 = short spread (short A, long B), +1 = long spread
    let pnl = 0;
    let trades = 0;
    let unhedgedLoss = 0;
    let maxDd = 0;
    let peak = 0;
    const equity: number[] = [];

    for (let i = 1; i < steps; i++) {
      const prevZ = zSeries[i - 1];
      const curZ = zSeries[i];
      const dz = curZ - prevZ;

      if (pos !== 0) {
        // Legging risk: one leg fails to fill on entry, leaving directional exposure
        const stepPnl = leggingFail ? pos * dz * 120 - Math.abs(dz) * 95 : pos * dz * 120;
        pnl += stepPnl;
        if (leggingFail) unhedgedLoss += Math.abs(dz) * 95;
      }

      if (pos === 0) {
        if (curZ >= entryZ) {
          pos = -1;
          trades += 1;
          pnl -= 18; // two-leg fee
        } else if (curZ <= -entryZ) {
          pos = 1;
          trades += 1;
          pnl -= 18;
        }
      } else if ((pos === -1 && curZ <= exitZ) || (pos === 1 && curZ >= -exitZ)) {
        pos = 0;
        pnl -= 18;
      }

      if (pnl > peak) peak = pnl;
      maxDd = Math.max(maxDd, peak - pnl);
      equity.push(Number(pnl.toFixed(0)));
    }

    return { zSeries, equity, finalPnl: pnl, trades, maxDd, unhedgedLoss };
  }, [entryZ, exitZ, regimeBreak, leggingFail]);

  const zMin = -3.5;
  const zMax = Math.max(3.5, ...sim.zSeries);
  const toY = (v: number) => 110 - ((v - zMin) / (zMax - zMin)) * 96;
  const pathD = sim.zSeries
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (sim.zSeries.length - 1)) * 460 + 10} ${toY(v).toFixed(1)}`)
    .join(' ');

  return (
    <div className="my-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1621] p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
            交互实验室 · 配对价差 Z-Score 与单腿/协整破裂演练台
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            正常协整区间内价差围绕 0 回归赚钱；打开「协整结构破裂」或「单腿成交风险」看看统计套利如何在 1 天内吐光半年利润。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setRegimeBreak((v) => !v); touch(); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold border cursor-pointer transition-colors ${
              regimeBreak
                ? 'bg-rose-500/15 border-rose-500 text-rose-500'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {regimeBreak ? '✓ 协整破裂已注入' : '注入协整结构破裂'}
          </button>
          <button
            type="button"
            onClick={() => { setLeggingFail((v) => !v); touch(); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold border cursor-pointer transition-colors ${
              leggingFail
                ? 'bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {leggingFail ? '✓ 单腿敞口已注入' : '注入单腿成交风险'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <label className="block rounded-xl border border-slate-200/80 dark:border-slate-800 p-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 dark:text-slate-300">开仓阈值 (|Z| ≥ Entry)</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">±{entryZ.toFixed(1)} σ</span>
          </div>
          <input type="range" min={1.0} max={3.0} step={0.1} value={entryZ} onChange={(e) => { setEntryZ(Number(e.target.value)); touch(); }} className="w-full accent-emerald-500" />
        </label>

        <label className="block rounded-xl border border-slate-200/80 dark:border-slate-800 p-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 dark:text-slate-300">平仓阈值 (|Z| ≤ Exit)</span>
            <span className="font-mono font-bold text-sky-600 dark:text-sky-400">±{exitZ.toFixed(1)} σ</span>
          </div>
          <input type="range" min={0.0} max={1.2} step={0.1} value={exitZ} onChange={(e) => { setExitZ(Number(e.target.value)); touch(); }} className="w-full accent-sky-500" />
        </label>
      </div>

      {/* Spread Z-Score SVG */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3 mb-4">
        <div className="flex justify-between text-[11px] text-slate-500 mb-1 font-mono">
          <span>Spread Z-Score 时间序列（虚线 = 开仓阈值 ±{entryZ.toFixed(1)}σ）</span>
          <span>{regimeBreak ? '⚠ 第 18 步后发生基本面脱锚' : '正常平稳协整'}</span>
        </div>
        <svg viewBox="0 0 480 120" className="w-full h-32">
          <line x1="10" y1={toY(0)} x2="470" y2={toY(0)} stroke="#64748b" strokeDasharray="3 3" strokeOpacity="0.45" />
          <line x1="10" y1={toY(entryZ)} x2="470" y2={toY(entryZ)} stroke="#f43f5e" strokeDasharray="4 4" strokeOpacity="0.65" />
          <line x1="10" y1={toY(-entryZ)} x2="470" y2={toY(-entryZ)} stroke="#10b981" strokeDasharray="4 4" strokeOpacity="0.65" />
          <path d={pathD} fill="none" stroke={regimeBreak ? '#f43f5e' : '#38bdf8'} strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 p-3">
          <div className="text-[11px] text-slate-500">策略净盈亏</div>
          <div className={`mt-1 font-mono text-xl font-bold ${sim.finalPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {sim.finalPnl >= 0 ? `+$${sim.finalPnl.toFixed(0)}` : `-$${Math.abs(sim.finalPnl).toFixed(0)}`}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 p-3">
          <div className="text-[11px] text-slate-500">最大回撤</div>
          <div className="mt-1 font-mono text-xl font-bold text-rose-500">-${sim.maxDd.toFixed(0)}</div>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 p-3">
          <div className="text-[11px] text-slate-500">开仓次数</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-800 dark:text-slate-100">{sim.trades} 次</div>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 p-3">
          <div className="text-[11px] text-slate-500">单腿暴露滑点损失</div>
          <div className="mt-1 font-mono text-xl font-bold text-amber-600 dark:text-amber-400">-${sim.unhedgedLoss.toFixed(0)}</div>
        </div>
      </div>
    </div>
  );
}
