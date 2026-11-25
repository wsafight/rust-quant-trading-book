import React, { useMemo, useState } from 'react';
import { markLabComplete } from '../../lib/progress';

interface Scenario {
  id: string;
  label: string;
  desc: string;
  // 1-year price return (%) and cash yield (%) for each bucket
  bondPrice: number;
  bondYield: number;
  dividendPrice: number;
  dividendYield: number;
  indexPrice: number;
  indexYield: number;
  leveragedSpotMove: number; // underlying move before 5x leverage
}

const SCENARIOS: Scenario[] = [
  {
    id: 'mild-bull',
    label: '温和慢牛',
    desc: '经济平稳增长，股市温和上涨，利率小幅波动。',
    bondPrice: 0.5,
    bondYield: 2.4,
    dividendPrice: 6.0,
    dividendYield: 4.8,
    indexPrice: 14.0,
    indexYield: 1.5,
    leveragedSpotMove: 12.0,
  },
  {
    id: 'sideways',
    label: '震荡磨底',
    desc: '指数一年原地踏步，但国债票息和红利股息照常落袋。',
    bondPrice: 1.2,
    bondYield: 2.4,
    dividendPrice: -1.0,
    dividendYield: 5.0,
    indexPrice: -4.0,
    indexYield: 1.5,
    leveragedSpotMove: -6.0,
  },
  {
    id: 'crash',
    label: '股灾暴跌',
    desc: '权益资产大跌 25%，避险资金涌入国债推高债价，高杠杆面临爆仓。',
    bondPrice: 5.5,
    bondYield: 2.4,
    dividendPrice: -11.0,
    dividendYield: 5.2,
    indexPrice: -25.0,
    indexYield: 1.5,
    leveragedSpotMove: -22.0,
  },
  {
    id: 'rate-cut',
    label: '降息放水',
    desc: '央行降息刺激经济，国债与股票双牛，杠杆收益被剧烈放大。',
    bondPrice: 6.2,
    bondYield: 2.2,
    dividendPrice: 9.0,
    dividendYield: 4.6,
    indexPrice: 18.0,
    indexYield: 1.5,
    leveragedSpotMove: 18.0,
  },
];

interface Preset {
  name: string;
  bond: number;
  dividend: number;
  indexFund: number;
  leveraged: number;
}

const PRESETS: Preset[] = [
  { name: '稳健国债底仓', bond: 70, dividend: 25, indexFund: 5, leveraged: 0 },
  { name: '经典股债红利平衡', bond: 40, dividend: 30, indexFund: 30, leveraged: 0 },
  { name: '全仓宽基 ETF', bond: 0, dividend: 0, indexFund: 100, leveraged: 0 },
  { name: '激进高倍杠杆', bond: 10, dividend: 10, indexFund: 20, leveraged: 60 },
];

const PRINCIPAL = 100_000;
const LEVERAGE_X = 5;

export default function AssetClassesLab() {
  const [scenarioId, setScenarioId] = useState<string>('crash');
  const [bondW, setBondW] = useState(40);
  const [dividendW, setDividendW] = useState(30);
  const [indexW, setIndexW] = useState(30);
  const [levW, setLevW] = useState(0);

  const touch = () => markLabComplete('00c-asset-classes');
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];

  const applyPreset = (p: Preset) => {
    setBondW(p.bond);
    setDividendW(p.dividend);
    setIndexW(p.indexFund);
    setLevW(p.leveraged);
    touch();
  };

  const result = useMemo(() => {
    const rawSum = bondW + dividendW + indexW + levW;
    const norm = rawSum > 0 ? rawSum : 100;
    const wb = rawSum > 0 ? bondW / norm : 0.25;
    const wd = rawSum > 0 ? dividendW / norm : 0.25;
    const wi = rawSum > 0 ? indexW / norm : 0.25;
    const wl = rawSum > 0 ? levW / norm : 0.25;

    const bondAlloc = PRINCIPAL * wb;
    const divAlloc = PRINCIPAL * wd;
    const idxAlloc = PRINCIPAL * wi;
    const levAlloc = PRINCIPAL * wl;

    const bondCash = bondAlloc * (scenario.bondYield / 100);
    const bondCap = bondAlloc * (scenario.bondPrice / 100);

    const divCash = divAlloc * (scenario.dividendYield / 100);
    const divCap = divAlloc * (scenario.dividendPrice / 100);

    const idxCash = idxAlloc * (scenario.indexYield / 100);
    const idxCap = idxAlloc * (scenario.indexPrice / 100);

    // 5x leverage: underlying drop >= 20% wipes out the leveraged sleeve (capped at -100%)
    const levRawPct = scenario.leveragedSpotMove * LEVERAGE_X;
    const levLiquidated = levAlloc > 0 && levRawPct <= -95;
    const levEffectivePct = Math.max(-100, levRawPct);
    const levPnl = levAlloc * (levEffectivePct / 100);

    const totalCashYield = bondCash + divCash + idxCash;
    const totalPricePnl = bondCap + divCap + idxCap + levPnl;
    const totalPnl = totalCashYield + totalPricePnl;
    const finalValue = PRINCIPAL + totalPnl;
    const totalReturnPct = (totalPnl / PRINCIPAL) * 100;

    // Rough annualized volatility intuition (%)
    const approxVol = wb * 3.5 + wd * 13 + wi * 22 + wl * 85;

    return {
      weightsPct: {
        bond: Math.round(wb * 100),
        dividend: Math.round(wd * 100),
        index: Math.round(wi * 100),
        lev: Math.round(wl * 100),
      },
      totalCashYield,
      totalPricePnl,
      totalPnl,
      finalValue,
      totalReturnPct,
      approxVol,
      levLiquidated,
      rows: [
        {
          name: '国债（安全气囊）',
          alloc: bondAlloc,
          cash: bondCash,
          cap: bondCap,
          color: 'text-sky-600 dark:text-sky-400',
          bar: 'bg-sky-500',
        },
        {
          name: '红利股 / 红利 ETF',
          alloc: divAlloc,
          cash: divCash,
          cap: divCap,
          color: 'text-emerald-600 dark:text-emerald-400',
          bar: 'bg-emerald-500',
        },
        {
          name: '宽基指数基金 / ETF',
          alloc: idxAlloc,
          cash: idxCash,
          cap: idxCap,
          color: 'text-violet-600 dark:text-violet-400',
          bar: 'bg-violet-500',
        },
        {
          name: `杠杆合约（${LEVERAGE_X}x）`,
          alloc: levAlloc,
          cash: 0,
          cap: levPnl,
          color: 'text-rose-600 dark:text-rose-400',
          bar: 'bg-rose-500',
        },
      ],
    };
  }, [bondW, dividendW, indexW, levW, scenario]);

  return (
    <div className="my-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1621] p-5 sm:p-6 shadow-sm space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-block rounded-md bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/25 px-2 py-0.5 text-[11px] font-semibold mb-1">
            交互体验台 · 资产全景与股债搭配模拟器
          </span>
          <h3 className="text-base font-bold text-slate-900 dark:text-white m-0!">
            10 万元本金放进 4 类资产：看懂不同行情下的“抗跌力”与“现金流”
          </h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => applyPreset(p)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:border-teal-500/50 hover:text-teal-700 dark:hover:text-teal-300 transition-colors cursor-pointer"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Market Scenario Switcher */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          第一步：切换市场年份情景
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setScenarioId(s.id);
                touch();
              }}
              className={`rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${
                scenarioId === s.id
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="text-xs font-bold">{s.label}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 m-0!">{scenario.desc}</p>
      </div>

      {/* Allocation Sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4">
        <label className="block space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-sky-700 dark:text-sky-300 font-medium">国债比例（低波避险）</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {result.weightsPct.bond}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={bondW}
            onChange={(e) => {
              setBondW(Number(e.target.value));
              touch();
            }}
            className="w-full accent-sky-500 cursor-pointer"
          />
        </label>

        <label className="block space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-emerald-700 dark:text-emerald-300 font-medium">红利股 / 红利 ETF（稳分红）</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {result.weightsPct.dividend}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={dividendW}
            onChange={(e) => {
              setDividendW(Number(e.target.value));
              touch();
            }}
            className="w-full accent-emerald-500 cursor-pointer"
          />
        </label>

        <label className="block space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-violet-700 dark:text-violet-300 font-medium">宽基指数基金 / ETF（跟大盘）</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {result.weightsPct.index}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={indexW}
            onChange={(e) => {
              setIndexW(Number(e.target.value));
              touch();
            }}
            className="w-full accent-violet-500 cursor-pointer"
          />
        </label>

        <label className="block space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-rose-700 dark:text-rose-300 font-medium">高倍杠杆合约（{LEVERAGE_X}x 放大）</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {result.weightsPct.lev}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={levW}
            onChange={(e) => {
              setLevW(Number(e.target.value));
              touch();
            }}
            className="w-full accent-rose-500 cursor-pointer"
          />
        </label>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">一年后账户净值</div>
          <div className="mt-1 font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white">
            ¥{Math.round(result.finalValue).toLocaleString()}
          </div>
          <div
            className={`text-xs font-mono font-semibold ${
              result.totalReturnPct >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {result.totalReturnPct >= 0 ? '+' : ''}
            {result.totalReturnPct.toFixed(1)}%
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">股息 + 债息现金流</div>
          <div className="mt-1 font-mono text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            +¥{Math.round(result.totalCashYield).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">不管涨跌照常到手</div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">价格涨跌盈亏</div>
          <div
            className={`mt-1 font-mono text-base font-bold tabular-nums ${
              result.totalPricePnl >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {result.totalPricePnl >= 0 ? '+' : '-'}¥
            {Math.abs(Math.round(result.totalPricePnl)).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">受行情波动影响</div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">估算组合波动率</div>
          <div className="mt-1 font-mono text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">
            ~{result.approxVol.toFixed(0)}% / 年
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {result.approxVol < 10 ? '偏稳健' : result.approxVol < 22 ? '中高波动' : '过山车级'}
          </div>
        </div>
      </div>

      {result.levLiquidated && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
          <strong>杠杆仓位触发强平爆仓：</strong>在「{scenario.label}」情景下，标的下跌{' '}
          {Math.abs(scenario.leveragedSpotMove)}%，{LEVERAGE_X} 倍杠杆仓位的本金直接归零，无法像国债和红利股一样靠时间慢慢熬回本。
        </div>
      )}

      {/* Breakdown List */}
      <div className="space-y-2">
        {result.rows.map((r) => {
          const pnl = r.cash + r.cap;
          return (
            <div
              key={r.name}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/70 dark:border-slate-800/80 px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${r.bar}`} />
                <span className={`font-semibold ${r.color}`}>{r.name}</span>
                <span className="font-mono text-slate-400">
                  投入 ¥{Math.round(r.alloc).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono tabular-nums">
                <span className="text-slate-500 dark:text-slate-400">
                  息/红利 +¥{Math.round(r.cash).toLocaleString()}
                </span>
                <span
                  className={
                    pnl >= 0
                      ? 'font-bold text-emerald-600 dark:text-emerald-400'
                      : 'font-bold text-rose-600 dark:text-rose-400'
                  }
                >
                  合计 {pnl >= 0 ? '+' : '-'}¥{Math.abs(Math.round(pnl)).toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
