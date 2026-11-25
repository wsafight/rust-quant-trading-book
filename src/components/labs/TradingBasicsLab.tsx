import { useMemo, useState } from 'react';
import { markLabComplete } from '../../lib/progress';

export default function TradingBasicsLab() {
  const [principal, setPrincipal] = useState(10000);
  const [leverage, setLeverage] = useState(5);
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [priceMovePct, setPriceMovePct] = useState(-8);
  const [feeBps, setFeeBps] = useState(10);

  const stats = useMemo(() => {
    const positionValue = principal * leverage;
    const signedMove = direction === 'long' ? priceMovePct : -priceMovePct;
    const rawPnl = positionValue * (signedMove / 100);
    // Round-trip fee (open + close)
    const feeCost = positionValue * ((feeBps * 2) / 10000);
    const netPnl = rawPnl - feeCost;
    const remaining = Math.max(0, principal + netPnl);
    const liquidated = principal + netPnl <= principal * 0.05;
    const liqMovePct = (95 / leverage).toFixed(1);
    const oneBpsMoney = (positionValue / 10000).toFixed(2);
    return {
      positionValue,
      rawPnl,
      feeCost,
      netPnl,
      remaining,
      liquidated,
      liqMovePct,
      oneBpsMoney,
    };
  }, [principal, leverage, direction, priceMovePct, feeBps]);

  const touch = () => markLabComplete('00b-trading-basics');

  return (
    <div className="my-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1621] p-5 sm:p-6 shadow-sm space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="inline-block rounded-md bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/25 px-2 py-0.5 text-[11px] font-semibold mb-1">
            交互体验台 · 交易账单与杠杆爆仓
          </span>
          <h3 className="text-base font-bold text-slate-900 dark:text-white m-0!">
            1 万元本金开杠杆：算清 bps 手续费、做多做空与爆仓红线
          </h3>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              setDirection('long');
              touch();
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer border transition-colors ${
              direction === 'long'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            做多（看涨）
          </button>
          <button
            type="button"
            onClick={() => {
              setDirection('short');
              touch();
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer border transition-colors ${
              direction === 'short'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            做空（看跌）
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4">
        <label className="block space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-300">你的自有本金</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              ¥{principal.toLocaleString()}
            </span>
          </div>
          <input
            type="range"
            min={2000}
            max={50000}
            step={2000}
            value={principal}
            onChange={(e) => {
              setPrincipal(Number(e.target.value));
              touch();
            }}
            className="w-full accent-emerald-600 cursor-pointer"
          />
        </label>

        <label className="block space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-300">杠杆倍数（向平台借钱放大）</span>
            <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{leverage}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={leverage}
            onChange={(e) => {
              setLeverage(Number(e.target.value));
              touch();
            }}
            className="w-full accent-amber-500 cursor-pointer"
          />
        </label>

        <label className="block space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-300">市场实际涨跌幅</span>
            <span
              className={`font-mono font-bold ${
                priceMovePct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
              }`}
            >
              {priceMovePct >= 0 ? '+' : ''}
              {priceMovePct}%
            </span>
          </div>
          <input
            type="range"
            min={-25}
            max={25}
            step={1}
            value={priceMovePct}
            onChange={(e) => {
              setPriceMovePct(Number(e.target.value));
              touch();
            }}
            className="w-full accent-sky-500 cursor-pointer"
          />
        </label>

        <label className="block space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-300">单边手续费（bps）</span>
            <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
              {feeBps} bps（{(feeBps / 100).toFixed(2)}%）
            </span>
          </div>
          <input
            type="range"
            min={2}
            max={30}
            step={2}
            value={feeBps}
            onChange={(e) => {
              setFeeBps(Number(e.target.value));
              touch();
            }}
            className="w-full accent-teal-500 cursor-pointer"
          />
        </label>
      </div>

      {/* Results */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
          <div className="text-[11px] text-slate-500">实际控制货值</div>
          <div className="font-mono text-base font-bold text-slate-900 dark:text-white mt-0.5">
            ¥{stats.positionValue.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">1 bps = ¥{stats.oneBpsMoney}</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
          <div className="text-[11px] text-slate-500">来回手续费</div>
          <div className="font-mono text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5">
            -¥{stats.feeCost.toFixed(0)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">按总货值算！</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
          <div className="text-[11px] text-slate-500">扣除费用后净盈亏</div>
          <div
            className={`font-mono text-base font-bold mt-0.5 ${
              stats.netPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
            }`}
          >
            {stats.netPnl >= 0 ? '+' : ''}¥{stats.netPnl.toFixed(0)}
          </div>
        </div>
        <div
          className={`rounded-xl border p-3 ${
            stats.liquidated
              ? 'border-rose-500/60 bg-rose-500/15'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50'
          }`}
        >
          <div className="text-[11px] text-slate-500">账户剩余本金</div>
          <div
            className={`font-mono text-base font-bold mt-0.5 ${
              stats.liquidated ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
            }`}
          >
            {stats.liquidated ? '已爆仓清零' : `¥${stats.remaining.toFixed(0)}`}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            反向波动 {stats.liqMovePct}% 触发强平
          </div>
        </div>
      </div>

      {stats.liquidated && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-800 dark:text-rose-200 leading-relaxed">
          <strong>触发强平！</strong>你开了 {leverage} 倍杠杆，市场只要朝反方向走大约{' '}
          <strong>{stats.liqMovePct}%</strong>，亏损就吃光了你的全部本金，平台会在你欠钱之前把仓位强制清零。
        </div>
      )}
    </div>
  );
}
