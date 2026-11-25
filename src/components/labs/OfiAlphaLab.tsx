import React, { useMemo, useState } from 'react';
import { markLabComplete } from '../../lib/progress';

interface TickEvent {
  id: number;
  label: string;
  deltaBid: number;
  deltaAsk: number;
  ofi: number;
  futureMoveBps: number;
}

const PRESET_SCENARIOS: Record<string, { name: string; desc: string; bidAdd: number; bidCancel: number; askAdd: number; askCancel: number; horizonMs: number; feeBps: number }> = {
  buyingPressure: {
    name: '买盘持续加单 + 卖一撤单',
    desc: '典型的多头订单流不平衡（强正 OFI），未来 200ms 上涨概率高',
    bidAdd: 42,
    bidCancel: 5,
    askAdd: 6,
    askCancel: 28,
    horizonMs: 250,
    feeBps: 1.5,
  },
  spoofingFade: {
    name: '拉长预测窗口（信号衰减）',
    desc: '微观结构 OFI 信号半衰期极短，拖到 3000ms 后 IC 断崖式衰减',
    bidAdd: 35,
    bidCancel: 8,
    askAdd: 10,
    askCancel: 20,
    horizonMs: 3000,
    feeBps: 2.0,
  },
  sellCascade: {
    name: '买一撤单 + 卖盘压单',
    desc: '强负 OFI：知情卖盘压境，此时若继续挂买单极易被砸穿',
    bidAdd: 4,
    bidCancel: 38,
    askAdd: 40,
    askCancel: 3,
    horizonMs: 200,
    feeBps: 1.5,
  },
};

export default function OfiAlphaLab() {
  const [bidAdd, setBidAdd] = useState(36);
  const [bidCancel, setBidCancel] = useState(6);
  const [askAdd, setAskAdd] = useState(10);
  const [askCancel, setAskCancel] = useState(22);
  const [horizonMs, setHorizonMs] = useState(250);
  const [feeBps, setFeeBps] = useState(1.5);

  const touch = () => markLabComplete('lab-17-ofi-alpha');

  const applyPreset = (key: keyof typeof PRESET_SCENARIOS) => {
    const p = PRESET_SCENARIOS[key];
    setBidAdd(p.bidAdd);
    setBidCancel(p.bidCancel);
    setAskAdd(p.askAdd);
    setAskCancel(p.askCancel);
    setHorizonMs(p.horizonMs);
    setFeeBps(p.feeBps);
    touch();
  };

  const stats = useMemo(() => {
    const deltaBid = bidAdd - bidCancel;
    const deltaAsk = askAdd - askCancel;
    const ofi = deltaBid - deltaAsk;
    const totalActivity = Math.max(1, bidAdd + bidCancel + askAdd + askCancel);
    const normalizedOfi = ofi / totalActivity; // [-1, 1]

    // Exponential decay of microstructure IC with prediction horizon (half-life ~450ms)
    const decay = Math.exp(-horizonMs / 650);
    const rawIc = 0.24 * Math.min(1, Math.abs(normalizedOfi) * 1.45) * decay;
    const expectedMoveBps = normalizedOfi * 9.5 * decay;
    const netEdgeBps = Math.abs(expectedMoveBps) - feeBps;

    const horizons = [50, 150, 300, 600, 1200, 2500, 4000];
    const decayCurve = horizons.map((ms) => {
      const d = Math.exp(-ms / 650);
      return {
        ms,
        ic: Number((0.24 * Math.min(1, Math.abs(normalizedOfi) * 1.45) * d).toFixed(3)),
        edge: Number((Math.abs(normalizedOfi * 9.5 * d) - feeBps).toFixed(2)),
      };
    });

    const signalDir =
      Math.abs(expectedMoveBps) < feeBps
        ? 'HOLD（扣费后无正期望）'
        : expectedMoveBps > 0
          ? 'BUY 信号（买方主动不平衡）'
          : 'SELL 信号（卖方主动不平衡）';

    const ticks: TickEvent[] = [
      { id: 1, label: '买一加单 (+ΔV_bid)', deltaBid: bidAdd, deltaAsk: 0, ofi: bidAdd, futureMoveBps: (bidAdd / totalActivity) * 9.5 * decay },
      { id: 2, label: '买一撤单 (-ΔV_bid)', deltaBid: -bidCancel, deltaAsk: 0, ofi: -bidCancel, futureMoveBps: (-bidCancel / totalActivity) * 9.5 * decay },
      { id: 3, label: '卖一撤单 (-ΔV_ask)', deltaBid: 0, deltaAsk: -askCancel, ofi: askCancel, futureMoveBps: (askCancel / totalActivity) * 9.5 * decay },
      { id: 4, label: '卖一加单 (+ΔV_ask)', deltaBid: 0, deltaAsk: askAdd, ofi: -askAdd, futureMoveBps: (-askAdd / totalActivity) * 9.5 * decay },
    ];

    return { deltaBid, deltaAsk, ofi, normalizedOfi, decay, rawIc, expectedMoveBps, netEdgeBps, decayCurve, signalDir, ticks };
  }, [bidAdd, bidCancel, askAdd, askCancel, horizonMs, feeBps]);

  return (
    <div className="my-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1621] p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
            交互实验室 · OFI 订单流不平衡与信号衰减台
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            OFI = ΔV_bid - ΔV_ask。拖动盘口增减与预测窗口，观察短周期微观结构 Alpha 如何被半衰期与手续费吞噬。
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(PRESET_SCENARIOS).map(([k, p]) => (
            <button
              key={k}
              type="button"
              onClick={() => applyPreset(k as keyof typeof PRESET_SCENARIOS)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:border-emerald-500/60 cursor-pointer transition-colors"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <label className="block rounded-xl border border-slate-200/80 dark:border-slate-800 p-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 dark:text-slate-300">买一新增挂单 (+Bid)</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">+{bidAdd} 手</span>
          </div>
          <input type="range" min={0} max={60} value={bidAdd} onChange={(e) => { setBidAdd(Number(e.target.value)); touch(); }} className="w-full accent-emerald-500" />
        </label>

        <label className="block rounded-xl border border-slate-200/80 dark:border-slate-800 p-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 dark:text-slate-300">买一撤单/被吃 (-Bid)</span>
            <span className="font-mono font-bold text-rose-500">-{bidCancel} 手</span>
          </div>
          <input type="range" min={0} max={60} value={bidCancel} onChange={(e) => { setBidCancel(Number(e.target.value)); touch(); }} className="w-full accent-rose-500" />
        </label>

        <label className="block rounded-xl border border-slate-200/80 dark:border-slate-800 p-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 dark:text-slate-300">卖一撤单/被扫 (-Ask)</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">-{askCancel} 手</span>
          </div>
          <input type="range" min={0} max={60} value={askCancel} onChange={(e) => { setAskCancel(Number(e.target.value)); touch(); }} className="w-full accent-emerald-500" />
        </label>

        <label className="block rounded-xl border border-slate-200/80 dark:border-slate-800 p-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 dark:text-slate-300">卖一新增压单 (+Ask)</span>
            <span className="font-mono font-bold text-rose-500">+{askAdd} 手</span>
          </div>
          <input type="range" min={0} max={60} value={askAdd} onChange={(e) => { setAskAdd(Number(e.target.value)); touch(); }} className="w-full accent-rose-500" />
        </label>

        <label className="block rounded-xl border border-slate-200/80 dark:border-slate-800 p-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 dark:text-slate-300">预测/持仓窗口 (Horizon)</span>
            <span className="font-mono font-bold text-sky-600 dark:text-sky-400">{horizonMs} ms</span>
          </div>
          <input type="range" min={50} max={4000} step={50} value={horizonMs} onChange={(e) => { setHorizonMs(Number(e.target.value)); touch(); }} className="w-full accent-sky-500" />
        </label>

        <label className="block rounded-xl border border-slate-200/80 dark:border-slate-800 p-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 dark:text-slate-300">双边交易成本 (Fee+Spread)</span>
            <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{feeBps.toFixed(1)} bps</span>
          </div>
          <input type="range" min={0.5} max={6} step={0.5} value={feeBps} onChange={(e) => { setFeeBps(Number(e.target.value)); touch(); }} className="w-full accent-amber-500" />
        </label>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 p-3">
          <div className="text-[11px] text-slate-500">净 OFI（ΔBid - ΔAsk）</div>
          <div className={`mt-1 font-mono text-xl font-bold ${stats.ofi >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {stats.ofi >= 0 ? `+${stats.ofi}` : stats.ofi} 手
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 p-3">
          <div className="text-[11px] text-slate-500">当前窗口 IC 估计</div>
          <div className="mt-1 font-mono text-xl font-bold text-sky-600 dark:text-sky-400">
            {stats.rawIc.toFixed(3)}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 p-3">
          <div className="text-[11px] text-slate-500">预测收益 vs 成本</div>
          <div className={`mt-1 font-mono text-xl font-bold ${stats.netEdgeBps > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {stats.netEdgeBps >= 0 ? `+${stats.netEdgeBps.toFixed(2)}` : stats.netEdgeBps.toFixed(2)} bps
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 p-3">
          <div className="text-[11px] text-slate-500">执行裁决</div>
          <div className={`mt-1 text-xs font-bold leading-snug ${stats.netEdgeBps > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {stats.signalDir}
          </div>
        </div>
      </div>

      {/* Decay Bar Chart */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4">
        <div className="flex items-center justify-between text-xs mb-3">
          <span className="font-semibold text-slate-700 dark:text-slate-200">OFI 信号半衰期衰减曲线（不同预测窗口的扣费净 Edge）</span>
          <span className="font-mono text-[11px] text-slate-500">半衰期 ≈ 450ms</span>
        </div>
        <div className="grid grid-cols-7 gap-2 items-end h-28">
          {stats.decayCurve.map((pt) => {
            const pct = Math.min(100, Math.max(8, (pt.ic / 0.25) * 100));
            const profitable = pt.edge > 0;
            const isNear = Math.abs(pt.ms - horizonMs) <= 200;
            return (
              <div key={pt.ms} className="flex flex-col items-center gap-1 h-full justify-end">
                <span className={`font-mono text-[10px] ${profitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                  {pt.edge >= 0 ? `+${pt.edge}` : pt.edge}
                </span>
                <div
                  className={`w-full rounded-t-md transition-all ${
                    profitable ? 'bg-emerald-500/80' : 'bg-rose-500/50'
                  } ${isNear ? 'ring-2 ring-sky-400' : ''}`}
                  style={{ height: `${pct}%` }}
                />
                <span className="font-mono text-[10px] text-slate-500">{pt.ms}ms</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
