import React, { useMemo, useState, useEffect } from 'react';
import { markLabComplete } from '../../lib/progress';

const HORIZONS = [
  { label: '0ms', ms: 0 },
  { label: '100ms', ms: 100 },
  { label: '250ms', ms: 250 },
  { label: '500ms', ms: 500 },
  { label: '1s', ms: 1000 },
  { label: '2s', ms: 2000 },
  { label: '5s', ms: 5000 },
];

export default function AdverseSelectionLab() {
  // Queue position: 0 = front of queue, 100 = back of queue
  const [queuePos, setQueuePos] = useState<number>(75);
  // Toxic informed flow ratio: 10% to 90%
  const [toxicity, setToxicity] = useState<number>(60);
  // Cancel latency in ms: 5ms to 250ms
  const [cancelLatency, setCancelLatency] = useState<number>(120);
  const [interacted, setInteracted] = useState(false);

  const halfSpreadBps = 2.5; // Bid 100.00, Ask 100.05 => Mid 100.025 => half-spread = 2.5 bps

  const metrics = useMemo(() => {
    const q = queuePos / 100; // 0..1
    const tox = toxicity / 100; // 0.1..0.9
    const lat = cancelLatency / 250; // 0.02..1

    // Noise fills happen more easily when you are near the front of the queue.
    const noiseFillProb = (1 - tox) * (0.78 - 0.55 * q);
    // Toxic sweeps eat through the whole level; slow cancel latency means you fail to escape.
    const toxicFillProb = tox * (0.35 + 0.55 * lat + 0.1 * q);

    const totalFillProb = Math.min(0.98, Math.max(0.05, noiseFillProb + toxicFillProb));
    const toxicShareOfFills = toxicFillProb / (noiseFillProb + toxicFillProb);

    // Price drift after a toxic sell sweep (bps, negative for our passive buy)
    const maxToxicDriftBps = -(4.5 + 8.5 * tox + 3.0 * lat);
    // Slight mean-reversion after pure noise fill (+0.4 bps)
    const noiseReversionBps = 0.4;

    const points = HORIZONS.map((h) => {
      const decay = 1 - Math.exp(-h.ms / 900);
      // At t=0ms, mid is 100.025 while we bought at 100.00 => +halfSpreadBps
      const toxicPath = halfSpreadBps + maxToxicDriftBps * decay;
      const noisePath = halfSpreadBps + noiseReversionBps * decay;
      const expectedMarkout =
        toxicShareOfFills * toxicPath + (1 - toxicShareOfFills) * noisePath;
      return {
        ...h,
        markout: Number(expectedMarkout.toFixed(2)),
        toxicPath: Number(toxicPath.toFixed(2)),
        noisePath: Number(noisePath.toFixed(2)),
      };
    });

    const markout5s = points[points.length - 1].markout;
    const adverseCostBps = halfSpreadBps - markout5s;

    return {
      fillRatePct: totalFillProb * 100,
      toxicSharePct: toxicShareOfFills * 100,
      markout5s,
      adverseCostBps,
      points,
    };
  }, [queuePos, toxicity, cancelLatency]);

  useEffect(() => {
    if (interacted) {
      markLabComplete('lab-adverse-selection');
    }
  }, [interacted]);

  const applyPreset = (q: number, t: number, l: number) => {
    setQueuePos(q);
    setToxicity(t);
    setCancelLatency(l);
    setInteracted(true);
  };

  // SVG chart coordinates
  const width = 560;
  const height = 220;
  const padL = 44;
  const padR = 20;
  const padT = 18;
  const padB = 30;
  const yMin = -12;
  const yMax = 5;

  const xScale = (idx: number) =>
    padL + (idx / (HORIZONS.length - 1)) * (width - padL - padR);
  const yScale = (val: number) => {
    const clamped = Math.max(yMin, Math.min(yMax, val));
    return padT + ((yMax - clamped) / (yMax - yMin)) * (height - padT - padB);
  };

  const makePath = (vals: number[]) =>
    vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`)
      .join(' ');

  const expectedLine = makePath(metrics.points.map((p) => p.markout));
  const noiseLine = makePath(metrics.points.map((p) => p.noisePath));
  const toxicLine = makePath(metrics.points.map((p) => p.toxicPath));
  const zeroY = yScale(0);
  const isLosing = metrics.markout5s < 0;

  return (
    <div className="my-8 rounded-2xl border border-emerald-500/30 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · 做市商 Markout 与逆向选择
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => applyPreset(10, 30, 10)}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 hover:bg-emerald-500/20 transition-colors cursor-pointer"
          >
            队头 + 快撤单
          </button>
          <button
            type="button"
            onClick={() => applyPreset(85, 65, 180)}
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 px-2.5 py-1 hover:bg-rose-500/20 transition-colors cursor-pointer"
          >
            队尾 + 慢撤单
          </button>
          <button
            type="button"
            onClick={() => applyPreset(40, 85, 140)}
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2.5 py-1 hover:bg-amber-500/20 transition-colors cursor-pointer"
          >
            高毒性单边行情
          </button>
        </div>
      </div>

      {/* Sliders */}
      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/30">
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-600 dark:text-slate-400">排队位置</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
              {queuePos}% ({queuePos < 30 ? '队头' : queuePos > 70 ? '队尾' : '队中'})
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={queuePos}
            onChange={(e) => {
              setQueuePos(Number(e.target.value));
              setInteracted(true);
            }}
            className="w-full accent-emerald-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
            <span>0% 最先成交</span>
            <span>100% 最后成交</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-600 dark:text-slate-400">信息流毒性</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
              {toxicity}%
            </span>
          </div>
          <input
            type="range"
            min={10}
            max={90}
            value={toxicity}
            onChange={(e) => {
              setToxicity(Number(e.target.value));
              setInteracted(true);
            }}
            className="w-full accent-amber-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
            <span>10% 散户噪声</span>
            <span>90% 知情扫盘</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-600 dark:text-slate-400">撤单延迟</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
              {cancelLatency} ms
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={250}
            step={5}
            value={cancelLatency}
            onChange={(e) => {
              setCancelLatency(Number(e.target.value));
              setInteracted(true);
            }}
            className="w-full accent-rose-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
            <span>5ms 托管机房</span>
            <span>250ms 跨区公网</span>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800">
        <div className="p-4">
          <div className="text-[11px] text-slate-500">挂单成交率</div>
          <div className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
            {metrics.fillRatePct.toFixed(1)}%
          </div>
        </div>
        <div className="p-4">
          <div className="text-[11px] text-slate-500">成交中“有毒”占比</div>
          <div className="mt-1 font-mono text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
            {metrics.toxicSharePct.toFixed(1)}%
          </div>
        </div>
        <div className="p-4">
          <div className="text-[11px] text-slate-500">理论半价差收益</div>
          <div className="mt-1 font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            +{halfSpreadBps.toFixed(1)} bps
          </div>
        </div>
        <div className={`p-4 ${isLosing ? 'bg-rose-500/8' : 'bg-emerald-500/8'}`}>
          <div className="text-[11px] text-slate-500">5s 真实 Markout</div>
          <div
            className={`mt-1 font-mono text-lg font-bold tabular-nums ${
              isLosing ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {metrics.markout5s >= 0 ? '+' : ''}
            {metrics.markout5s.toFixed(2)} bps
          </div>
        </div>
      </div>

      {/* SVG Markout Curve */}
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            成交后价格演进曲线：signed_markout_bps(h)
          </span>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="inline-block w-3 h-0.5 bg-emerald-400/70" /> 噪声成交路径
            </span>
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="inline-block w-3 h-0.5 bg-rose-400/60 border-b border-dashed" /> 知情扫盘路径
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
              <span
                className={`inline-block w-3 h-1 rounded ${
                  isLosing ? 'bg-rose-500' : 'bg-emerald-500'
                }`}
              />
              你的期望 Markout
            </span>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto min-w-[420px] select-none"
          >
            {/* Horizontal grid lines */}
            {[-10, -5, 0, 2.5, 5].map((tick) => {
              const y = yScale(tick);
              return (
                <g key={tick}>
                  <line
                    x1={padL}
                    x2={width - padR}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    className={
                      tick === 0
                        ? 'text-slate-400 dark:text-slate-500'
                        : 'text-slate-200 dark:text-slate-800'
                    }
                    strokeWidth={tick === 0 ? 1.2 : 1}
                    strokeDasharray={tick === 0 ? '4 4' : undefined}
                  />
                  <text
                    x={padL - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    className="fill-slate-400 font-mono text-[10px]"
                  >
                    {tick > 0 ? `+${tick}` : tick}
                  </text>
                </g>
              );
            })}

            {/* Zero-line loss shading hint */}
            <rect
              x={padL}
              y={zeroY}
              width={width - padL - padR}
              height={height - padB - zeroY}
              className="fill-rose-500/[0.04]"
            />

            {/* Noise & Toxic reference paths */}
            <path
              d={noiseLine}
              fill="none"
              stroke="#34d399"
              strokeWidth={1.5}
              strokeOpacity={0.55}
              strokeDasharray="4 4"
            />
            <path
              d={toxicLine}
              fill="none"
              stroke="#fb7185"
              strokeWidth={1.5}
              strokeOpacity={0.55}
              strokeDasharray="4 4"
            />

            {/* Main Expected Markout curve */}
            <path
              d={expectedLine}
              fill="none"
              stroke={isLosing ? '#f43f5e' : '#10b981'}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data dots & X-axis labels */}
            {metrics.points.map((pt, i) => (
              <g key={pt.label}>
                <circle
                  cx={xScale(i)}
                  cy={yScale(pt.markout)}
                  r={4}
                  className={isLosing ? 'fill-rose-500' : 'fill-emerald-500'}
                />
                <text
                  x={xScale(i)}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-slate-500 font-mono text-[10.5px]"
                >
                  {pt.label}
                </text>
              </g>
            ))}
          </svg>
        </div>

        <div
          className={`mt-3 rounded-xl border px-4 py-3 text-xs leading-relaxed ${
            isLosing
              ? 'border-rose-500/30 bg-rose-500/8 text-rose-900 dark:text-rose-200'
              : 'border-emerald-500/30 bg-emerald-500/8 text-emerald-900 dark:text-emerald-200'
          }`}
        >
          {isLosing ? (
            <>
              <strong>逆向选择吞噬了价差！</strong> 虽然你表面上以买一价成交赚到了{' '}
              <span className="font-mono font-bold">+{halfSpreadBps} bps</span>{' '}
              半价差，但因为你的成交里{' '}
              <span className="font-mono font-bold">{metrics.toxicSharePct.toFixed(0)}%</span>{' '}
              都是知情大单砸穿盘口给你的，5 秒后价格平均又跌了{' '}
              <span className="font-mono font-bold">{metrics.adverseCostBps.toFixed(1)} bps</span>
              ，最终每成交一笔反而净亏{' '}
              <span className="font-mono font-bold">{Math.abs(metrics.markout5s).toFixed(2)} bps</span>。
            </>
          ) : (
            <>
              <strong>当前参数下做市为正期望。</strong>{' '}
              靠前的排队位置让你吃到了足够多的散户噪声成交，而较低的撤单延迟帮你在知情大单来临时及时逃跑，5 秒后仍保住{' '}
              <span className="font-mono font-bold">+{metrics.markout5s.toFixed(2)} bps</span> 净优势。
            </>
          )}
        </div>
      </div>
    </div>
  );
}
