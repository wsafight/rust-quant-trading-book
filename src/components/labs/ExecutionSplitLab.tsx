import React, { useMemo, useState, useEffect } from 'react';
import { markLabComplete } from '../../lib/progress';

export default function ExecutionSplitLab() {
  const [parentQty, setParentQty] = useState(120);
  const [slices, setSlices] = useState(6);
  const [driftBps, setDriftBps] = useState(18);
  const [makerRatio, setMakerRatio] = useState(40);
  const [touched, setTouched] = useState(false);

  const arrivalPrice = 100.0;

  const result = useMemo(() => {
    // 1) Single Market Sweep: huge immediate impact, zero timing drift
    const singleImpactBps = 2.5 + 0.32 * parentQty;
    const singleTimingBps = 0;
    const singleTotalBps = singleImpactBps + singleTimingBps;

    // 2) TWAP: equal slices over time
    const twapSliceQty = parentQty / slices;
    const twapPerSliceImpact = (1 - makerRatio / 100) * (2.5 + 0.28 * twapSliceQty);
    const twapTimingBps = driftBps * ((slices - 1) / (2 * slices)) * 1.15;
    const twapTotalBps = twapPerSliceImpact + twapTimingBps;

    // 3) VWAP (U-shaped volume profile): bigger slices when liquidity is thick
    const weights = Array.from({ length: slices }, (_, i) => {
      const x = slices === 1 ? 0.5 : i / (slices - 1);
      return 1 + 1.4 * Math.pow(2 * x - 1, 2);
    });
    const weightSum = weights.reduce((a, b) => a + b, 0);
    const slicePlan = weights.map((w, idx) => {
      const vwapQty = Math.round((parentQty * w) / weightSum);
      const twapQty = Math.round(parentQty / slices);
      const t = slices === 1 ? 0 : idx / (slices - 1);
      const px = arrivalPrice * (1 + (driftBps * t) / 10000);
      return { idx: idx + 1, twapQty, vwapQty, px };
    });

    // VWAP reduces impact by ~22% because larger slices execute in deeper windows
    const vwapImpactBps = twapPerSliceImpact * 0.78;
    const vwapTimingBps = twapTimingBps * 0.96;
    const vwapTotalBps = vwapImpactBps + vwapTimingBps;

    const best =
      singleTotalBps <= twapTotalBps && singleTotalBps <= vwapTotalBps
        ? 'Single'
        : vwapTotalBps <= twapTotalBps
          ? 'VWAP'
          : 'TWAP';

    return {
      singleImpactBps,
      singleTimingBps,
      singleTotalBps,
      twapPerSliceImpact,
      twapTimingBps,
      twapTotalBps,
      vwapImpactBps,
      vwapTimingBps,
      vwapTotalBps,
      slicePlan,
      best,
    };
  }, [parentQty, slices, driftBps, makerRatio]);

  useEffect(() => {
    if (touched) markLabComplete('lab-execution-split');
  }, [touched]);

  const maxBar = Math.max(result.singleTotalBps, result.twapTotalBps, result.vwapTotalBps, 1);

  return (
    <div className="my-8 rounded-2xl border border-emerald-500/30 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · 父单拆单执行模拟器（Single vs TWAP vs VWAP）
          </span>
        </div>
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-300">
          当前最优：{result.best}
        </span>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">父单总量</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{parentQty} 手</span>
            </div>
            <input
              type="range"
              min={20}
              max={240}
              step={10}
              value={parentQty}
              onChange={(e) => { setParentQty(Number(e.target.value)); setTouched(true); }}
              className="w-full accent-emerald-500"
            />
          </label>

          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">拆分批次数</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{slices} 批</span>
            </div>
            <input
              type="range"
              min={2}
              max={12}
              step={1}
              value={slices}
              onChange={(e) => { setSlices(Number(e.target.value)); setTouched(true); }}
              className="w-full accent-sky-500"
            />
          </label>

          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">执行期间价格漂移</span>
              <span className="font-mono font-bold text-rose-500">+{driftBps} bps</span>
            </div>
            <input
              type="range"
              min={0}
              max={60}
              step={2}
              value={driftBps}
              onChange={(e) => { setDriftBps(Number(e.target.value)); setTouched(true); }}
              className="w-full accent-rose-500"
            />
          </label>

          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">Maker 被动成交占比</span>
              <span className="font-mono font-bold text-amber-500">{makerRatio}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={makerRatio}
              onChange={(e) => { setMakerRatio(Number(e.target.value)); setTouched(true); }}
              className="w-full accent-amber-500"
            />
          </label>
        </div>

        {/* Implementation Shortfall Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              name: '一次性市价扫单',
              impact: result.singleImpactBps,
              timing: result.singleTimingBps,
              total: result.singleTotalBps,
              tag: result.best === 'Single',
            },
            {
              name: `TWAP（等量 ${slices} 批）`,
              impact: result.twapPerSliceImpact,
              timing: result.twapTimingBps,
              total: result.twapTotalBps,
              tag: result.best === 'TWAP',
            },
            {
              name: `VWAP（按流动性加权）`,
              impact: result.vwapImpactBps,
              timing: result.vwapTimingBps,
              total: result.vwapTotalBps,
              tag: result.best === 'VWAP',
            },
          ].map((item) => (
            <div
              key={item.name}
              className={`rounded-xl border p-4 ${
                item.tag
                  ? 'border-emerald-500/50 bg-emerald-500/8'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</span>
                {item.tag && (
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    最低 IS
                  </span>
                )}
              </div>
              <div className="font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                +{item.total.toFixed(1)} <span className="text-xs font-normal text-slate-500">bps</span>
              </div>
              <div className="mt-2 h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
                <div
                  className="bg-amber-500 h-full transition-all"
                  style={{ width: `${(item.impact / maxBar) * 100}%` }}
                  title="盘口冲击成本"
                />
                <div
                  className="bg-rose-500 h-full transition-all"
                  style={{ width: `${(item.timing / maxBar) * 100}%` }}
                  title="时间漂移风险"
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px] font-mono text-slate-500">
                <span>冲击 {item.impact.toFixed(1)}</span>
                <span>漂移 {item.timing.toFixed(1)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Slice Distribution Bar */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0b1017] p-4">
          <div className="text-xs font-semibold text-slate-500 mb-3">
            VWAP 各时间窗子单切片分配（两端高流动性窗口分配更大容量）
          </div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${slices}, minmax(0, 1fr))` }}>
            {result.slicePlan.map((s) => {
              const maxQ = Math.max(...result.slicePlan.map((x) => x.vwapQty), 1);
              const hPct = Math.max(18, (s.vwapQty / maxQ) * 100);
              return (
                <div key={s.idx} className="flex flex-col items-center gap-1">
                  <div className="h-16 w-full flex items-end justify-center">
                    <div
                      className="w-full max-w-[36px] rounded-t-md bg-emerald-500/75 border border-emerald-400/50 transition-all"
                      style={{ height: `${hPct}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-slate-700 dark:text-slate-300">{s.vwapQty}</span>
                  <span className="font-mono text-[9px] text-slate-400">T{s.idx}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
