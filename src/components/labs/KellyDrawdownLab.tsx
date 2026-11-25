import React, { useMemo, useState, useEffect } from 'react';
import { markLabComplete } from '../../lib/progress';

export default function KellyDrawdownLab() {
  const [winRate, setWinRate] = useState(55); // %
  const [payoff, setPayoff] = useState(1.2); // win/loss ratio
  const [kellyMult, setKellyMult] = useState(1.0); // 0.25x .. 2.5x
  const [touched, setTouched] = useState(false);

  const sim = useMemo(() => {
    const p = winRate / 100;
    const q = 1 - p;
    const b = payoff;
    const fullKelly = Math.max(0, (p * b - q) / b);
    const f = Math.min(0.95, fullKelly * kellyMult);

    // Expected log growth rate g(f) = p*ln(1+b*f) + q*ln(1-f)
    const logGrowth = (frac: number) => {
      if (frac <= 0) return 0;
      if (frac >= 0.99) return -1;
      return p * Math.log(1 + b * frac) + q * Math.log(1 - frac);
    };

    // Deterministic 40-trade sequence matching winRate approximately
    const trades: number[] = [];
    for (let i = 1; i <= 40; i++) {
      // Deterministic pseudo-random sequence
      const hash = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
      const u = hash - Math.floor(hash);
      trades.push(u < p ? 1 : -1);
    }

    let eq = 100;
    let peak = 100;
    let maxDd = 0;
    const curve = [100];
    for (const t of trades) {
      eq = t > 0 ? eq * (1 + b * f) : eq * (1 - f);
      if (eq > peak) peak = eq;
      const dd = (peak - eq) / peak;
      if (dd > maxDd) maxDd = dd;
      curve.push(eq);
    }

    const gCurrent = logGrowth(f) * 100;
    const gOptimal = logGrowth(fullKelly) * 100;

    return { fullKelly, f, gCurrent, gOptimal, curve, maxDd: maxDd * 100, finalEq: eq };
  }, [winRate, payoff, kellyMult]);

  useEffect(() => {
    if (touched) markLabComplete('lab-kelly-drawdown');
  }, [touched]);

  const width = 560;
  const height = 190;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 26;
  const minVal = Math.min(...sim.curve, 50);
  const maxVal = Math.max(...sim.curve, 150);
  const xScale = (i: number) => padL + (i / (sim.curve.length - 1)) * (width - padL - padR);
  const yScale = (v: number) =>
    padT + ((maxVal - v) / Math.max(1, maxVal - minVal)) * (height - padT - padB);
  const path = sim.curve
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`)
    .join(' ');

  const isOverLeveraged = sim.gCurrent < 0;

  return (
    <div className="my-8 rounded-2xl border border-sky-500/30 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${isOverLeveraged ? 'bg-rose-500' : 'bg-emerald-500'}`} />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · 凯利公式与过度杠杆归零模拟器
          </span>
        </div>
        <div className="flex gap-1.5 text-[11px] font-mono">
          <button type="button" onClick={() => { setKellyMult(0.5); setTouched(true); }} className="rounded-lg bg-emerald-500/15 px-2 py-1 text-emerald-700 dark:text-emerald-300 cursor-pointer">半凯利 0.5x</button>
          <button type="button" onClick={() => { setKellyMult(1.0); setTouched(true); }} className="rounded-lg bg-sky-500/15 px-2 py-1 text-sky-700 dark:text-sky-300 cursor-pointer">满凯利 1.0x</button>
          <button type="button" onClick={() => { setKellyMult(2.3); setTouched(true); }} className="rounded-lg bg-rose-500/15 px-2 py-1 text-rose-700 dark:text-rose-300 cursor-pointer">过度杠杆 2.3x</button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">胜率 (p)</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{winRate}%</span>
            </div>
            <input type="range" min={45} max={70} step={1} value={winRate} onChange={(e) => { setWinRate(Number(e.target.value)); setTouched(true); }} className="w-full accent-emerald-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">盈亏比 (b)</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{payoff.toFixed(1)} : 1</span>
            </div>
            <input type="range" min={0.8} max={2.5} step={0.1} value={payoff} onChange={(e) => { setPayoff(Number(e.target.value)); setTouched(true); }} className="w-full accent-sky-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">下注倍率 (× Kelly)</span>
              <span className={`font-mono font-bold ${kellyMult > 1.8 ? 'text-rose-500' : 'text-amber-500'}`}>{kellyMult.toFixed(2)}x</span>
            </div>
            <input type="range" min={0.25} max={2.5} step={0.05} value={kellyMult} onChange={(e) => { setKellyMult(Number(e.target.value)); setTouched(true); }} className="w-full accent-rose-500" />
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] text-slate-500">当前仓位比例 f</div>
            <div className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-white">{(sim.f * 100).toFixed(1)}%</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] text-slate-500">复利对数增长率 g(f)</div>
            <div className={`mt-1 font-mono text-base font-bold ${isOverLeveraged ? 'text-rose-500' : 'text-emerald-500'}`}>
              {sim.gCurrent >= 0 ? '+' : ''}{sim.gCurrent.toFixed(2)}%
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] text-slate-500">样本最大回撤</div>
            <div className="mt-1 font-mono text-base font-bold text-rose-500">-{sim.maxDd.toFixed(1)}%</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] text-slate-500">40 笔后净值 (初始 100)</div>
            <div className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-white">{sim.finalEq.toFixed(1)}</div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0b1017] p-3">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
            <line x1={padL} x2={width - padR} y1={yScale(100)} y2={yScale(100)} stroke="#64748b" strokeDasharray="4 4" strokeWidth={1} />
            <path d={path} fill="none" stroke={isOverLeveraged ? '#f43f5e' : '#10b981'} strokeWidth={2.5} strokeLinejoin="round" />
            <text x={padL - 6} y={yScale(100) + 3} textAnchor="end" className="fill-slate-400 font-mono text-[10px]">100</text>
            <text x={width - padR} y={height - 6} textAnchor="end" className="fill-slate-400 font-mono text-[10px]">40 笔确定性序列演进</text>
          </svg>
        </div>

        <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${isOverLeveraged ? 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200' : 'border-emerald-500/30 bg-emerald-500/8 text-slate-700 dark:text-slate-200'}`}>
          {isOverLeveraged
            ? '危险！虽然策略本身胜率与盈亏比都是正期望，但因为仓位超过了 2 倍凯利，复利增长率 g(f) 已经变负——交易次数越多，账户越确定地走向归零！'
            : '实盘里常用「半凯利（0.5x）」：只牺牲 25% 的理论复利增速，却把净值波动方差砍掉 75%，大幅缩短最大回撤恢复期。'}
        </div>
      </div>
    </div>
  );
}
