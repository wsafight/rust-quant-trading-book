import { useMemo, useState, useEffect } from 'react';
import { markLabComplete } from '../../lib/progress';

export default function BacktestModelsLab() {
  const [latencyMs, setLatencyMs] = useState(45);
  const [feeBps, setFeeBps] = useState(2.0);
  const [queueAhead, setQueueAhead] = useState(12);
  const [touched, setTouched] = useState(false);

  const sim = useMemo(() => {
    const steps = 25;
    const touch: number[] = [100];
    const tradeThrough: number[] = [100];
    const l2Queue: number[] = [100];

    for (let i = 1; i <= steps; i++) {
      const wave = Math.sin(i * 0.7) * 0.6;
      // Touch: ignores latency & queue, assumes 100% passive fill at touch
      const rTouch = 1.9 - feeBps * 0.15 + wave;
      // TradeThrough: requires price to cross level, loses edge with latency
      const rTT = 1.15 - latencyMs * 0.014 - feeBps * 0.25 + wave * 0.9;
      // L2Queue: realistic queue + latency + adverse selection when filled
      const rL2 = 0.85 - latencyMs * 0.018 - queueAhead * 0.032 - feeBps * 0.3 + wave * 0.85;

      touch.push(touch[i - 1] * (1 + rTouch / 100));
      tradeThrough.push(tradeThrough[i - 1] * (1 + rTT / 100));
      l2Queue.push(l2Queue[i - 1] * (1 + rL2 / 100));
    }

    const ann = (arr: number[]) => ((arr[arr.length - 1] / 100 - 1) * 4 * 100);
    return {
      touch,
      tradeThrough,
      l2Queue,
      annTouch: ann(touch),
      annTT: ann(tradeThrough),
      annL2: ann(l2Queue),
    };
  }, [latencyMs, feeBps, queueAhead]);

  useEffect(() => {
    if (touched) markLabComplete('lab-backtest-models');
  }, [touched]);

  const width = 560;
  const height = 200;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 26;
  const all = [...sim.touch, ...sim.tradeThrough, ...sim.l2Queue];
  const minV = Math.min(...all, 85);
  const maxV = Math.max(...all, 130);
  const x = (i: number) => padL + (i / (sim.touch.length - 1)) * (width - padL - padR);
  const y = (v: number) => padT + ((maxV - v) / Math.max(1, maxV - minV)) * (height - padT - padB);
  const toPath = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  return (
    <div className="my-8 rounded-2xl border border-violet-500/30 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-violet-500" />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · 三撮合假设同场回放对比器（Touch vs TradeThrough vs L2Queue）
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-500">code/src/simulator.rs</span>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">往返网络延迟</span>
              <span className="font-mono font-bold text-rose-500">{latencyMs} ms</span>
            </div>
            <input type="range" min={0} max={150} step={5} value={latencyMs} onChange={(e) => { setLatencyMs(Number(e.target.value)); setTouched(true); }} className="w-full accent-rose-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">单边手续费</span>
              <span className="font-mono font-bold text-amber-500">{feeBps.toFixed(1)} bps</span>
            </div>
            <input type="range" min={0} max={6} step={0.5} value={feeBps} onChange={(e) => { setFeeBps(Number(e.target.value)); setTouched(true); }} className="w-full accent-amber-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">前方排队量 (queue_ahead)</span>
              <span className="font-mono font-bold text-violet-500">{queueAhead} 手</span>
            </div>
            <input type="range" min={0} max={40} step={2} value={queueAhead} onChange={(e) => { setQueueAhead(Number(e.target.value)); setTouched(true); }} className="w-full accent-violet-500" />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-3">
            <div className="text-[11px] font-sans text-emerald-700 dark:text-emerald-300">① Touch（触价即成 · 幻觉）</div>
            <div className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {sim.annTouch >= 0 ? '+' : ''}{sim.annTouch.toFixed(0)}% 年化
            </div>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3">
            <div className="text-[11px] font-sans text-amber-700 dark:text-amber-300">② TradeThrough（穿价成交）</div>
            <div className="mt-1 text-lg font-bold text-amber-600 dark:text-amber-400">
              {sim.annTT >= 0 ? '+' : ''}{sim.annTT.toFixed(0)}% 年化
            </div>
          </div>
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 p-3">
            <div className="text-[11px] font-sans text-rose-700 dark:text-rose-300">③ L2Queue（真实排队 + 延迟）</div>
            <div className={`mt-1 text-lg font-bold ${sim.annL2 >= 0 ? 'text-sky-500' : 'text-rose-500'}`}>
              {sim.annL2 >= 0 ? '+' : ''}{sim.annL2.toFixed(0)}% 年化
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0b1017] p-3">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
            <line x1={padL} x2={width - padR} y1={y(100)} y2={y(100)} stroke="#64748b" strokeDasharray="4 4" strokeWidth={1} />
            <path d={toPath(sim.touch)} fill="none" stroke="#10b981" strokeWidth={2.5} />
            <path d={toPath(sim.tradeThrough)} fill="none" stroke="#f59e0b" strokeWidth={2.5} />
            <path d={toPath(sim.l2Queue)} fill="none" stroke="#f43f5e" strokeWidth={3} />
            <text x={padL - 6} y={y(100) + 3} textAnchor="end" className="fill-slate-400 font-mono text-[10px]">100</text>
          </svg>
        </div>
      </div>
    </div>
  );
}
