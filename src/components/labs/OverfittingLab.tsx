import { useMemo, useState, useEffect } from 'react';
import { markLabComplete } from '../../lib/progress';

export default function OverfittingLab() {
  const [trials, setTrials] = useState(100);
  const [trueEdge, setTrueEdge] = useState(0.2); // true underlying Sharpe
  const [regime, setRegime] = useState<'island' | 'plateau'>('island');
  const [touched, setTouched] = useState(false);

  const metrics = useMemo(() => {
    // Extreme value approximation for max of N standard normals: ~ sqrt(2 * ln(N))
    const noiseBoost = trials <= 1 ? 0 : Math.sqrt(2 * Math.log(trials)) * 0.72;
    const isBestSharpe = trueEdge + noiseBoost;
    // Out-of-sample suffers shrinkage & transaction/regime decay
    const oosSharpe = regime === 'plateau' ? trueEdge * 0.85 : trueEdge * 0.25 - 0.15;
    const falseDiscoveryRisk = Math.min(99, Math.round((1 - Math.pow(0.95, trials)) * 100));

    // 5x5 parameter grid
    const grid = Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => {
        const dist = Math.hypot(r - 2, c - 2);
        if (regime === 'plateau') {
          return Number((1.45 - dist * 0.22 + trueEdge * 0.4).toFixed(2));
        }
        return dist === 0 ? Number(isBestSharpe.toFixed(2)) : Number((-0.3 + ((r * 7 + c * 13) % 5) * 0.12).toFixed(2));
      })
    );

    return { isBestSharpe, oosSharpe, falseDiscoveryRisk, grid };
  }, [trials, trueEdge, regime]);

  useEffect(() => {
    if (touched) markLabComplete('lab-overfitting');
  }, [touched]);

  return (
    <div className="my-8 rounded-2xl border border-violet-500/30 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-violet-500" />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · 多重检验过拟合与参数高原/孤岛模拟器
          </span>
        </div>
        <div className="flex gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => { setRegime('island'); setTouched(true); }}
            className={`rounded-lg px-2.5 py-1 font-medium cursor-pointer ${regime === 'island' ? 'bg-rose-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
          >
            参数孤岛（过拟合）
          </button>
          <button
            type="button"
            onClick={() => { setRegime('plateau'); setTouched(true); }}
            className={`rounded-lg px-2.5 py-1 font-medium cursor-pointer ${regime === 'plateau' ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
          >
            参数高原（稳健）
          </button>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-5">
        <div className="space-y-4">
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">网格调参尝试次数 (N Trials)</span>
              <span className="font-mono font-bold text-violet-500">{trials} 组参数</span>
            </div>
            <input type="range" min={1} max={500} step={5} value={trials} onChange={(e) => { setTrials(Number(e.target.value)); setTouched(true); }} className="w-full accent-violet-500" />
          </label>

          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">策略真实 Alpha（底噪之上）</span>
              <span className="font-mono font-bold text-emerald-500">Sharpe {trueEdge.toFixed(2)}</span>
            </div>
            <input type="range" min={0} max={1.5} step={0.1} value={trueEdge} onChange={(e) => { setTrueEdge(Number(e.target.value)); setTouched(true); }} className="w-full accent-emerald-500" />
          </label>

          <div className="grid grid-cols-3 gap-2.5 font-mono">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3">
              <div className="text-[11px] font-sans text-slate-500">样本内最优 Sharpe</div>
              <div className="mt-1 text-lg font-bold text-amber-600 dark:text-amber-400">
                {metrics.isBestSharpe.toFixed(2)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
              <div className="text-[11px] font-sans text-slate-500">样本外真实 Sharpe</div>
              <div className={`mt-1 text-lg font-bold ${metrics.oosSharpe > 0.3 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {metrics.oosSharpe.toFixed(2)}
              </div>
            </div>
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 p-3">
              <div className="text-[11px] font-sans text-slate-500">至少 1 组假阳性概率</div>
              <div className="mt-1 text-lg font-bold text-rose-500">{metrics.falseDiscoveryRisk}%</div>
            </div>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed m-0!">
            把「真实 Alpha」拖到 <strong>0.00</strong>，再把调参次数拖到 <strong>200 组</strong>：哪怕策略完全是抛硬币，挑出来的“最优参数”样本内夏普也能轻松飙到 <strong>2.3+</strong>！
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0b1017] p-4">
          <div className="text-xs font-semibold text-slate-500 mb-3">
            5×5 参数热力图：{regime === 'plateau' ? '邻域全部稳定盈利（高原）' : '只有中心单点爆表（孤岛）'}
          </div>
          <div className="grid grid-cols-5 gap-1.5 font-mono text-[11px]">
            {metrics.grid.flat().map((val, idx) => (
              <div
                key={idx}
                className={`rounded-lg py-2.5 text-center font-bold border ${
                  val >= 1.2
                    ? 'bg-emerald-500/25 border-emerald-500/50 text-emerald-700 dark:text-emerald-200'
                    : val >= 0.4
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-500/12 border-rose-500/25 text-rose-700 dark:text-rose-300'
                }`}
              >
                {val.toFixed(1)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
