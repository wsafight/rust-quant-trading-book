import { useMemo, useState, useEffect } from 'react';
import { markLabComplete } from '../../lib/progress';

const ACTIVE_BUY = 3;
const ACTIVE_SELL = 1;
const UNCERTAIN_SELL = 0;
const MAX_ABS_POS = 10;

export default function WorstCaseRiskLab() {
  const [position, setPosition] = useState(4);
  const [uncertainBuy, setUncertainBuy] = useState(2);
  const [newSide, setNewSide] = useState<'buy' | 'sell'>('buy');
  const [newQty, setNewQty] = useState(3);
  const [enabled, setEnabled] = useState(true);
  const [bookFresh, setBookFresh] = useState(true);
  const [touched, setTouched] = useState(false);

  const verdict = useMemo(() => {
    const worstLong = position + ACTIVE_BUY + uncertainBuy;
    const worstShort = position - ACTIVE_SELL - UNCERTAIN_SELL;
    const projected = newSide === 'buy' ? worstLong + newQty : worstShort - newQty;

    if (!enabled) {
      return { status: 'REJECT', reason: 'RiskRejectReason::TradingDisabled (Kill Switch 已触发)', worstLong, worstShort, projected };
    }
    if (!bookFresh) {
      return { status: 'REJECT', reason: 'RiskRejectReason::StaleMarketData (行情已过期)', worstLong, worstShort, projected };
    }
    if (newSide === 'buy' && worstLong + newQty > MAX_ABS_POS) {
      const avail = Math.max(0, MAX_ABS_POS - worstLong);
      return {
        status: avail > 0 ? 'RESIZE' : 'REJECT',
        reason:
          avail > 0
            ? `RiskDecision::Resize { max_qty_lots: ${avail} }（超仓自动缩量）`
            : `RiskRejectReason::PositionLimit（worst_long=${worstLong} 已触顶 ${MAX_ABS_POS}）`,
        worstLong,
        worstShort,
        projected,
      };
    }
    if (newSide === 'sell' && worstShort - newQty < -MAX_ABS_POS) {
      const avail = Math.max(0, MAX_ABS_POS + worstShort);
      return {
        status: avail > 0 ? 'RESIZE' : 'REJECT',
        reason:
          avail > 0
            ? `RiskDecision::Resize { max_qty_lots: ${avail} }（超空自动缩量）`
            : `RiskRejectReason::PositionLimit（worst_short=${worstShort} 已触底 -${MAX_ABS_POS}）`,
        worstLong,
        worstShort,
        projected,
      };
    }
    return { status: 'ALLOW', reason: 'RiskDecision::Allow（最坏敞口在硬限额内）', worstLong, worstShort, projected };
  }, [position, uncertainBuy, newSide, newQty, enabled, bookFresh]);

  useEffect(() => {
    if (touched) markLabComplete('lab-worst-case-risk');
  }, [touched]);

  return (
    <div className="my-8 rounded-2xl border border-amber-500/35 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${verdict.status === 'ALLOW' ? 'bg-emerald-500' : verdict.status === 'RESIZE' ? 'bg-amber-500' : 'bg-rose-500'}`} />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · 独立硬风控与 worst_long / worst_short 计算器
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => { setEnabled((v) => !v); setTouched(true); }}
            className={`rounded-lg px-2.5 py-1 font-bold cursor-pointer ${enabled ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}
          >
            {enabled ? 'Kill Switch: 正常' : '🚨 Kill Switch: 熔断中'}
          </button>
          <button
            type="button"
            onClick={() => { setBookFresh((v) => !v); setTouched(true); }}
            className={`rounded-lg px-2.5 py-1 font-medium cursor-pointer ${bookFresh ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200' : 'bg-amber-500 text-slate-950 font-bold'}`}
          >
            {bookFresh ? '行情: 新鲜' : '行情: 陈旧'}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">当前持仓 (position)</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{position}</span>
            </div>
            <input type="range" min={-10} max={10} value={position} onChange={(e) => { setPosition(Number(e.target.value)); setTouched(true); }} className="w-full accent-sky-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">在途买单 + Uncertain 买单</span>
              <span className="font-mono font-bold text-amber-500">{ACTIVE_BUY} + {uncertainBuy}</span>
            </div>
            <input type="range" min={0} max={8} value={uncertainBuy} onChange={(e) => { setUncertainBuy(Number(e.target.value)); setTouched(true); }} className="w-full accent-amber-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">新单方向与数量（上限 ±{MAX_ABS_POS}）</span>
              <span className="font-mono font-bold text-emerald-500">{newSide.toUpperCase()} {newQty}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setNewSide(newSide === 'buy' ? 'sell' : 'buy'); setTouched(true); }} className="rounded bg-slate-200 dark:bg-slate-800 px-2 py-0.5 font-mono text-xs cursor-pointer">
                切换买卖
              </button>
              <input type="range" min={1} max={8} value={newQty} onChange={(e) => { setNewQty(Number(e.target.value)); setTouched(true); }} className="flex-1 accent-emerald-500" />
            </div>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] font-sans text-slate-500">worst_long = pos + actB + uncB</div>
            <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{verdict.worstLong} / +{MAX_ABS_POS}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] font-sans text-slate-500">worst_short = pos - actS - uncS</div>
            <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{verdict.worstShort} / -{MAX_ABS_POS}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] font-sans text-slate-500">新单叠加后最坏敞口</div>
            <div className="mt-1 text-lg font-bold text-amber-500">{verdict.projected}</div>
          </div>
        </div>

        <div
          className={`rounded-xl border px-4 py-3 font-mono text-xs font-bold ${
            verdict.status === 'ALLOW'
              ? 'border-emerald-500/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
              : verdict.status === 'RESIZE'
                ? 'border-amber-500/40 bg-amber-500/12 text-amber-800 dark:text-amber-200'
                : 'border-rose-500/40 bg-rose-500/12 text-rose-700 dark:text-rose-300'
          }`}
        >
          判定结果：{verdict.reason}
        </div>
      </div>
    </div>
  );
}
