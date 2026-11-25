import { useState } from 'react';
import { markLabComplete } from '../../lib/progress';

interface LedgerState {
  initialCash: number;
  cash: number;
  position: number;
  avgCost: number;
  realizedPnl: number;
  feesPaid: number;
  seenKeys: string[];
  markPrice: number;
}

const INIT: LedgerState = {
  initialCash: 100000,
  cash: 100000,
  position: 0,
  avgCost: 0,
  realizedPnl: 0,
  feesPaid: 0,
  seenKeys: [],
  markPrice: 100,
};

export default function LedgerReconcileLab() {
  const [state, setState] = useState<LedgerState>(INIT);
  const [lastNote, setLastNote] = useState('点击下方成交按钮，观察双式账本的资金守恒恒等式。');
  const [seq, setSeq] = useState(1);

  const applyFill = (key: string, side: 'buy' | 'sell', qty: number, price: number, fee: number) => {
    markLabComplete('lab-ledger-reconcile');
    if (state.seenKeys.includes(key)) {
      setLastNote(`幂等拦截：ExecutionKey("${key}") 已记账，cash / position / PnL 均保持不变！`);
      return;
    }

    const signedQty = side === 'buy' ? qty : -qty;
    const cashDelta = side === 'buy' ? -(qty * price) - fee : qty * price - fee;
    let newPos = state.position;
    let newAvg = state.avgCost;
    let realizedDelta = 0;

    if (state.position === 0 || Math.sign(state.position) === Math.sign(signedQty)) {
      // Adding to same direction
      const totalAbs = Math.abs(state.position) + qty;
      newAvg = (Math.abs(state.position) * state.avgCost + qty * price) / totalAbs;
      newPos = state.position + signedQty;
    } else {
      // Reducing or flipping direction
      const closeQty = Math.min(Math.abs(state.position), qty);
      realizedDelta =
        state.position > 0
          ? closeQty * (price - state.avgCost)
          : closeQty * (state.avgCost - price);
      newPos = state.position + signedQty;
      if (newPos === 0) {
        newAvg = 0;
      } else if (Math.sign(newPos) !== Math.sign(state.position)) {
        // Flipped! Remaining open position starts at current fill price
        newAvg = price;
      }
    }

    setState({
      ...state,
      cash: state.cash + cashDelta,
      position: newPos,
      avgCost: newAvg,
      realizedPnl: state.realizedPnl + realizedDelta,
      feesPaid: state.feesPaid + fee,
      seenKeys: [...state.seenKeys, key],
    });
    setLastNote(
      `记账成功 [${key}]：${side === 'buy' ? '买入' : '卖出'} ${qty} @ ${price}（手续费 ${fee}），已实现盈亏 ${realizedDelta >= 0 ? '+' : ''}${realizedDelta.toFixed(2)}`
    );
  };

  const unrealized =
    state.position === 0
      ? 0
      : state.position > 0
        ? state.position * (state.markPrice - state.avgCost)
        : Math.abs(state.position) * (state.avgCost - state.markPrice);

  const equityByBook = state.cash + state.position * state.markPrice;
  const equityByPnl = state.initialCash + state.realizedPnl + unrealized - state.feesPaid;
  const conservationOk = Math.abs(equityByBook - equityByPnl) < 1e-6;

  return (
    <div className="my-8 rounded-2xl border border-sky-500/30 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · 双式成交账本与多空反手对账器
          </span>
        </div>
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
          {conservationOk ? '✓ 权益守恒闭环通过' : '✗ 对账失衡'}
        </span>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          <button
            type="button"
            onClick={() => {
              const k = `fill-${seq}`;
              setSeq((s) => s + 1);
              applyFill(k, 'buy', 10, 100, 2);
            }}
            className="rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 px-3 py-1.5 text-emerald-700 dark:text-emerald-300 cursor-pointer"
          >
            + 买 10 @ 100 (fee 2)
          </button>
          <button
            type="button"
            onClick={() => {
              const k = `fill-${seq}`;
              setSeq((s) => s + 1);
              applyFill(k, 'sell', 15, 104, 3);
            }}
            className="rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 px-3 py-1.5 text-rose-700 dark:text-rose-300 cursor-pointer"
          >
            + 卖 15 @ 104（触发多翻空）
          </button>
          <button
            type="button"
            onClick={() => applyFill('fill-1', 'buy', 10, 100, 2)}
            className="rounded-lg bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/35 px-3 py-1.5 text-violet-700 dark:text-violet-300 cursor-pointer"
          >
            ↻ 重放 fill-1（测幂等）
          </button>
          <button
            type="button"
            onClick={() => setState((s) => ({ ...s, markPrice: s.markPrice === 100 ? 106 : 100 }))}
            className="rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 px-3 py-1.5 text-sky-700 dark:text-sky-300 cursor-pointer"
          >
            切换 Mark Price ({state.markPrice} → {state.markPrice === 100 ? 106 : 100})
          </button>
          <button
            type="button"
            onClick={() => { setState(INIT); setSeq(1); setLastNote('账本已重置'); }}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-slate-500 cursor-pointer"
          >
            重置
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] font-sans text-slate-500">现金余额 (Cash)</div>
            <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">${state.cash.toFixed(1)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] font-sans text-slate-500">净持仓 / 持仓均价</div>
            <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">
              {state.position} @ {state.avgCost.toFixed(2)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] font-sans text-slate-500">已实现 / 未实现 PnL</div>
            <div className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {state.realizedPnl.toFixed(1)} / {unrealized.toFixed(1)}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-3">
            <div className="text-[11px] font-sans text-slate-500">总权益 (Mark={state.markPrice})</div>
            <div className="mt-1 text-base font-bold text-emerald-700 dark:text-emerald-300">
              ${equityByBook.toFixed(1)}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0b1017] px-4 py-3 text-xs font-mono text-slate-700 dark:text-slate-300 space-y-1">
          <div>权益恒等校验：Cash + Pos × Mark = <strong>{equityByBook.toFixed(2)}</strong> == Init + Realized + Unrealized − Fees = <strong>{equityByPnl.toFixed(2)}</strong></div>
          <div className="text-slate-500 font-sans">{lastNote}</div>
        </div>
      </div>
    </div>
  );
}
