import React, { useMemo, useState } from 'react';
import { markLabComplete } from '../../lib/progress';

export default function PortfolioRiskParityLab() {
  const [corr, setCorr] = useState(0.15);
  const [volHigh, setVolHigh] = useState(32); // Strategy C high volatility %
  const [crisisMode, setCrisisMode] = useState(false);

  const touch = () => markLabComplete('lab-19-portfolio-risk-parity');

  const result = useMemo(() => {
    const effectiveCorr = crisisMode ? 0.92 : corr;
    // 3 strategies: A (MM, vol 8%), B (Arb, vol 12%), C (Trend, vol volHigh%)
    const vols = [0.08, 0.12, volHigh / 100];
    const rets = [0.14, 0.16, 0.24];

    const calcPortfolio = (weights: number[]) => {
      let variance = 0;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const rho = i === j ? 1 : effectiveCorr;
          variance += weights[i] * weights[j] * vols[i] * vols[j] * rho;
        }
      }
      const vol = Math.sqrt(variance);
      const ret = weights[0] * rets[0] + weights[1] * rets[1] + weights[2] * rets[2];
      const sharpe = vol > 0 ? ret / vol : 0;
      const tailDd = vol * (crisisMode ? 2.8 : 1.7) * 100;
      // Marginal risk contribution of Strategy C
      const covC =
        weights[0] * vols[0] * vols[2] * effectiveCorr +
        weights[1] * vols[1] * vols[2] * effectiveCorr +
        weights[2] * vols[2] * vols[2];
      const rcC = variance > 0 ? ((weights[2] * covC) / variance) * 100 : 0;
      return { weights, vol: vol * 100, ret: ret * 100, sharpe, tailDd, rcC };
    };

    const equal = calcPortfolio([1 / 3, 1 / 3, 1 / 3]);
    const invSum = 1 / vols[0] + 1 / vols[1] + 1 / vols[2];
    const invVol = calcPortfolio([1 / vols[0] / invSum, 1 / vols[1] / invSum, 1 / vols[2] / invSum]);

    return { effectiveCorr, equal, invVol };
  }, [corr, volHigh, crisisMode]);

  return (
    <div className="my-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1621] p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
            交互实验室 · 多策略相关性崩塌与风险平价对比台
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            组合包含：策略 A（低波做市 8%）、策略 B（中波套利 12%）、策略 C（高波趋势 {volHigh}%）。一键模拟危机日相关性飙升至 0.92。
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setCrisisMode((v) => !v); touch(); }}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold border cursor-pointer transition-colors ${
            crisisMode
              ? 'bg-rose-500/15 border-rose-500 text-rose-500'
              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-rose-500/60'
          }`}
        >
          {crisisMode ? '⚠ 危机模式：相关性 ρ = 0.92' : '模拟黑天鹅相关性崩塌 (ρ → 0.92)'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <label className="block rounded-xl border border-slate-200/80 dark:border-slate-800 p-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 dark:text-slate-300">常态策略间相关系数 (ρ)</span>
            <span className="font-mono font-bold text-sky-600 dark:text-sky-400">{result.effectiveCorr.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={-0.3}
            max={0.95}
            step={0.05}
            disabled={crisisMode}
            value={corr}
            onChange={(e) => { setCorr(Number(e.target.value)); touch(); }}
            className="w-full accent-sky-500 disabled:opacity-40"
          />
        </label>

        <label className="block rounded-xl border border-slate-200/80 dark:border-slate-800 p-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 dark:text-slate-300">高波趋势策略 C 年化波动率</span>
            <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{volHigh}%</span>
          </div>
          <input type="range" min={12} max={60} step={2} value={volHigh} onChange={(e) => { setVolHigh(Number(e.target.value)); touch(); }} className="w-full accent-amber-500" />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { title: '等权资金分配（1/3, 1/3, 1/3）', data: result.equal, accent: 'rose' },
          { title: '波动率倒数 / 风险平价分配（1/σ）', data: result.invVol, accent: 'emerald' },
        ].map((card) => (
          <div key={card.title} className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-4">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-3">{card.title}</div>
            <div className="flex gap-2 mb-3 text-[11px] font-mono">
              {['A(做市)', 'B(套利)', 'C(趋势)'].map((name, idx) => (
                <span key={name} className="rounded bg-white dark:bg-slate-800 px-2 py-0.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                  {name}: {(card.data.weights[idx] * 100).toFixed(0)}%
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <div className="text-slate-500 text-[11px]">组合夏普比率</div>
                <div className={`font-mono text-lg font-bold ${card.accent === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}`}>
                  {card.data.sharpe.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px]">组合年化波动 / 压力回撤</div>
                <div className="font-mono text-lg font-bold text-rose-500">
                  {card.data.vol.toFixed(1)}% / -{card.data.tailDd.toFixed(1)}%
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
              高波策略 C 占组合总风险贡献：
              <strong className={`ml-1 font-mono ${card.data.rcC > 60 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {card.data.rcC.toFixed(1)}%
              </strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
