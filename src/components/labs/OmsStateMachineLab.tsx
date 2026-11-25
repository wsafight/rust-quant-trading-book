import React, { useState } from 'react';
import { markLabComplete } from '../../lib/progress';

type OrderStatus =
  | 'PendingNew'
  | 'Open'
  | 'PartiallyFilled'
  | 'PendingCancel'
  | 'Filled'
  | 'Cancelled'
  | 'Rejected'
  | 'Uncertain';

interface SimOrder {
  totalQty: number;
  filledQty: number;
  status: OrderStatus;
  executions: string[];
}

type SimEvent =
  | { type: 'NewAck' }
  | { type: 'Reject' }
  | { type: 'CancelRequested' }
  | { type: 'CancelAck' }
  | { type: 'Timeout' }
  | { type: 'Fill'; key: string; qty: number };

interface LogEntry {
  step: number;
  eventLabel: string;
  from: OrderStatus;
  to: OrderStatus;
  filledAfter: number;
  outcome: 'ok' | 'dedup' | 'error';
  note: string;
}

const INITIAL_ORDER: SimOrder = {
  totalQty: 10,
  filledQty: 0,
  status: 'PendingNew',
  executions: [],
};

function isTerminal(s: OrderStatus): boolean {
  return s === 'Filled' || s === 'Cancelled' || s === 'Rejected';
}

/** Exact port of code/src/oms.rs::reduce */
function reduceOrder(
  order: SimOrder,
  event: SimEvent
): { ok: true; next: SimOrder; dedup?: boolean; note: string } | { ok: false; error: string } {
  const next: SimOrder = {
    ...order,
    executions: [...order.executions],
  };

  switch (event.type) {
    case 'Fill': {
      if (next.executions.includes(event.key)) {
        return {
          ok: true,
          next,
          dedup: true,
          note: `ExecutionKey("${event.key}") 已存在，幂等忽略，filled_qty 保持 ${next.filledQty}`,
        };
      }
      if (next.status === 'Rejected') {
        return { ok: false, error: 'ReduceError::IllegalTransition（已拒单不能再成交）' };
      }
      const previousStatus = next.status;
      const attempted = next.filledQty + event.qty;
      if (attempted > next.totalQty) {
        return {
          ok: false,
          error: `ReduceError::Overfill { total: ${next.totalQty}, attempted: ${attempted} }`,
        };
      }
      next.executions.push(event.key);
      next.filledQty = attempted;
      if (attempted === next.totalQty) {
        next.status = 'Filled';
        return { ok: true, next, note: `累计成交达到总量 ${next.totalQty}，进入终态 Filled` };
      } else if (previousStatus === 'Cancelled') {
        next.status = 'Cancelled';
        return { ok: true, next, note: '撤单回报早于成交到达：补记成交量，保持终态 Cancelled' };
      } else if (previousStatus === 'PendingCancel') {
        next.status = 'PendingCancel';
        return { ok: true, next, note: '撤单在途期间收到部分成交，保持 PendingCancel 等待撤单确认' };
      } else {
        next.status = 'PartiallyFilled';
        return { ok: true, next, note: `记录部分成交 +${event.qty}，当前 filled_qty=${attempted}` };
      }
    }

    case 'NewAck': {
      if (next.status === 'PendingNew' || next.status === 'Uncertain') {
        next.status = next.filledQty === 0 ? 'Open' : 'PartiallyFilled';
        return {
          ok: true,
          next,
          note:
            order.status === 'Uncertain'
              ? '迟到的 NewAck 解除 Uncertain 风险锁'
              : '交易所确认挂单成功',
        };
      }
      if (
        next.status === 'PartiallyFilled' ||
        next.status === 'Filled' ||
        next.status === 'Cancelled'
      ) {
        return {
          ok: true,
          next,
          note: `Fill/Cancel 先于 NewAck 到达：吸收迟到确认，绝不回退 ${next.status}`,
        };
      }
      return { ok: false, error: `ReduceError::IllegalTransition（${next.status} 不接受 NewAck）` };
    }

    case 'Reject': {
      if ((next.status === 'PendingNew' || next.status === 'Uncertain') && next.filledQty === 0) {
        next.status = 'Rejected';
        return { ok: true, next, note: '交易所明确拒单且 0 成交，安全解除在途敞口' };
      }
      return { ok: false, error: 'ReduceError::IllegalTransition（仅 0 成交的 PendingNew/Uncertain 可被拒单）' };
    }

    case 'CancelRequested': {
      if (next.status === 'Open' || next.status === 'PartiallyFilled') {
        next.status = 'PendingCancel';
        return { ok: true, next, note: '发出撤单请求，等待交易所 CancelAck（期间仍可能成交）' };
      }
      return { ok: false, error: `ReduceError::IllegalTransition（${next.status} 不能发起撤单）` };
    }

    case 'CancelAck': {
      if (
        next.status === 'Open' ||
        next.status === 'PartiallyFilled' ||
        next.status === 'PendingCancel' ||
        next.status === 'Uncertain'
      ) {
        next.status = 'Cancelled';
        return { ok: true, next, note: '交易所确认撤单完成，剩余数量释放' };
      }
      if (next.status === 'Filled' || next.status === 'Cancelled') {
        return { ok: true, next, note: `迟到的 CancelAck 绝不回退终态 ${next.status}` };
      }
      return { ok: false, error: `ReduceError::IllegalTransition（${next.status} 不接受 CancelAck）` };
    }

    case 'Timeout': {
      if (!isTerminal(next.status)) {
        next.status = 'Uncertain';
        return {
          ok: true,
          next,
          note: '超时绝不等于下单失败！切入 Uncertain，风控必须继续按最坏敞口锁定',
        };
      }
      return { ok: true, next, note: `已处于终态 ${next.status}，忽略过期超时事件` };
    }
  }
}

const NODE_POS: Record<OrderStatus, { x: number; y: number; zh: string }> = {
  PendingNew: { x: 85, y: 65, zh: '待确认' },
  Open: { x: 245, y: 65, zh: '挂单中' },
  PartiallyFilled: { x: 415, y: 65, zh: '部分成交' },
  PendingCancel: { x: 415, y: 175, zh: '撤单在途' },
  Uncertain: { x: 245, y: 175, zh: '未知锁定' },
  Filled: { x: 565, y: 65, zh: '已全成' },
  Cancelled: { x: 565, y: 175, zh: '已撤销' },
  Rejected: { x: 85, y: 175, zh: '已拒单' },
};

export default function OmsStateMachineLab() {
  const [order, setOrder] = useState<SimOrder>(INITIAL_ORDER);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [fillSeq, setFillSeq] = useState(1);

  const reset = () => {
    setOrder(INITIAL_ORDER);
    setLogs([]);
    setFillSeq(1);
  };

  const dispatch = (event: SimEvent, label: string) => {
    const res = reduceOrder(order, event);
    markLabComplete('lab-oms-state-machine');

    if (res.ok) {
      setOrder(res.next);
      setLogs((prev) => [
        {
          step: prev.length + 1,
          eventLabel: label,
          from: order.status,
          to: res.next.status,
          filledAfter: res.next.filledQty,
          outcome: res.dedup ? 'dedup' : 'ok',
          note: res.note,
        },
        ...prev,
      ]);
    } else {
      setLogs((prev) => [
        {
          step: prev.length + 1,
          eventLabel: label,
          from: order.status,
          to: order.status,
          filledAfter: order.filledQty,
          outcome: 'error',
          note: res.error,
        },
        ...prev,
      ]);
    }
  };

  const runScenario = (events: Array<{ event: SimEvent; label: string }>) => {
    let cur = INITIAL_ORDER;
    const newLogs: LogEntry[] = [];
    events.forEach((item, idx) => {
      const res = reduceOrder(cur, item.event);
      if (res.ok) {
        newLogs.unshift({
          step: idx + 1,
          eventLabel: item.label,
          from: cur.status,
          to: res.next.status,
          filledAfter: res.next.filledQty,
          outcome: res.dedup ? 'dedup' : 'ok',
          note: res.note,
        });
        cur = res.next;
      } else {
        newLogs.unshift({
          step: idx + 1,
          eventLabel: item.label,
          from: cur.status,
          to: cur.status,
          filledAfter: cur.filledQty,
          outcome: 'error',
          note: res.error,
        });
      }
    });
    setOrder(cur);
    setLogs(newLogs);
    setFillSeq(events.length + 1);
    markLabComplete('lab-oms-state-machine');
  };

  const worstCaseOpenQty =
    order.status === 'Filled' || order.status === 'Cancelled' || order.status === 'Rejected'
      ? 0
      : order.totalQty - order.filledQty;

  return (
    <div className="my-8 rounded-2xl border border-emerald-500/30 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-sky-500 animate-pulse" />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · OMS 乱序状态机（与 code/src/oms.rs 100% 同规则）
          </span>
        </div>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-emerald-500 cursor-pointer"
        >
          重置订单
        </button>
      </div>

      {/* Preset Real-World Race Scenarios */}
      <div className="px-5 py-3 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/40 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500 font-medium">一键重放实盘乱序事故：</span>
        <button
          type="button"
          onClick={() =>
            runScenario([
              { event: { type: 'Fill', key: 'exec-1', qty: 10 }, label: 'Fill(exec-1, 10)' },
              { event: { type: 'NewAck' }, label: 'NewAck（迟到）' },
            ])
          }
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 px-2.5 py-1 hover:bg-amber-500/20 cursor-pointer"
        >
          成交先于确认
        </button>
        <button
          type="button"
          onClick={() =>
            runScenario([
              { event: { type: 'NewAck' }, label: 'NewAck' },
              { event: { type: 'CancelRequested' }, label: 'CancelRequested' },
              { event: { type: 'Fill', key: 'exec-1', qty: 4 }, label: 'Fill(exec-1, 4)' },
              { event: { type: 'CancelAck' }, label: 'CancelAck' },
            ])
          }
          className="rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300 px-2.5 py-1 hover:bg-sky-500/20 cursor-pointer"
        >
          撤单/成交竞态
        </button>
        <button
          type="button"
          onClick={() =>
            runScenario([
              { event: { type: 'NewAck' }, label: 'NewAck' },
              { event: { type: 'Fill', key: 'dup-1', qty: 4 }, label: 'Fill(dup-1, 4)' },
              { event: { type: 'Fill', key: 'dup-1', qty: 4 }, label: 'Fill(dup-1, 4) 重复' },
            ])
          }
          className="rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-300 px-2.5 py-1 hover:bg-violet-500/20 cursor-pointer"
        >
          重复回报幂等
        </button>
        <button
          type="button"
          onClick={() =>
            runScenario([
              { event: { type: 'Timeout' }, label: 'Timeout（断网超时）' },
            ])
          }
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300 px-2.5 py-1 hover:bg-rose-500/20 cursor-pointer"
        >
          超时 → Uncertain 锁
        </button>
      </div>

      {/* SVG State Machine Diagram */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-950/[0.02] dark:bg-slate-950/40 overflow-x-auto">
        <svg viewBox="0 0 650 230" className="w-full h-auto min-w-[520px] select-none">
          {/* Connectors */}
          <g className="stroke-slate-300 dark:stroke-slate-700" strokeWidth={1.5} fill="none">
            <line x1="140" y1="65" x2="190" y2="65" />
            <line x1="300" y1="65" x2="352" y2="65" />
            <line x1="478" y1="65" x2="515" y2="65" />
            <line x1="85" y1="90" x2="85" y2="150" />
            <line x1="245" y1="90" x2="245" y2="150" />
            <line x1="415" y1="90" x2="415" y2="150" />
            <line x1="478" y1="175" x2="515" y2="175" />
            <path d="M 135 85 Q 190 130 210 152" strokeDasharray="3 3" />
            <path d="M 295 175 L 352 175" strokeDasharray="3 3" />
          </g>

          {(Object.keys(NODE_POS) as OrderStatus[]).map((st) => {
            const pos = NODE_POS[st];
            const active = order.status === st;
            const isUncertain = st === 'Uncertain';
            const isTerm = isTerminal(st);

            let boxClass =
              'fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700';
            let textClass = 'fill-slate-600 dark:fill-slate-400';

            if (active) {
              if (isUncertain) {
                boxClass = 'fill-rose-500/20 stroke-rose-500';
                textClass = 'fill-rose-600 dark:fill-rose-300';
              } else if (st === 'Filled') {
                boxClass = 'fill-emerald-500/20 stroke-emerald-500';
                textClass = 'fill-emerald-600 dark:fill-emerald-300';
              } else {
                boxClass = 'fill-sky-500/20 stroke-sky-500';
                textClass = 'fill-sky-600 dark:fill-sky-300';
              }
            }

            return (
              <g key={st} transform={`translate(${pos.x}, ${pos.y})`}>
                <rect
                  x={-58}
                  y={-24}
                  width={116}
                  height={48}
                  rx={10}
                  strokeWidth={active ? 2.5 : 1.2}
                  className={`transition-all duration-200 ${boxClass}`}
                />
                <text
                  y={-3}
                  textAnchor="middle"
                  className={`font-mono text-[11px] font-bold ${textClass}`}
                >
                  {st}
                </text>
                <text
                  y={13}
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px]"
                >
                  {pos.zh}
                  {isTerm ? ' · 终态' : ''}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Live Order State Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800 text-xs">
        <div className="p-3.5">
          <div className="text-slate-500 text-[11px]">当前状态</div>
          <div
            className={`mt-0.5 font-mono font-bold text-sm ${
              order.status === 'Uncertain'
                ? 'text-rose-600 dark:text-rose-400'
                : order.status === 'Filled'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-sky-600 dark:text-sky-400'
            }`}
          >
            {order.status}
          </div>
        </div>
        <div className="p-3.5">
          <div className="text-slate-500 text-[11px]">已成交 / 总量</div>
          <div className="mt-0.5 font-mono font-bold text-sm text-slate-900 dark:text-white tabular-nums">
            {order.filledQty} / {order.totalQty}
          </div>
        </div>
        <div className="p-3.5">
          <div className="text-slate-500 text-[11px]">风控最坏在途敞口</div>
          <div className="mt-0.5 font-mono font-bold text-sm text-amber-600 dark:text-amber-400 tabular-nums">
            {worstCaseOpenQty} 手 {order.status === 'Uncertain' ? '(锁定)' : ''}
          </div>
        </div>
        <div className="p-3.5">
          <div className="text-slate-500 text-[11px]">去重集合 (executions)</div>
          <div className="mt-0.5 font-mono text-xs text-slate-700 dark:text-slate-300 truncate">
            {order.executions.length > 0 ? order.executions.join(', ') : '∅ 空'}
          </div>
        </div>
      </div>

      {/* Free-play Event Injector + Audit Log */}
      <div className="p-5 space-y-4">
        <div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
            自由注入事件（按任意顺序点击，观察状态机如何防御）：
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-mono">
            <button
              type="button"
              onClick={() => dispatch({ type: 'NewAck' }, 'NewAck')}
              className="rounded-lg bg-slate-200/80 dark:bg-slate-800 hover:bg-sky-500/20 px-3 py-1.5 text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              + NewAck
            </button>
            <button
              type="button"
              onClick={() => {
                const key = `f-${fillSeq}`;
                setFillSeq((s) => s + 1);
                dispatch({ type: 'Fill', key, qty: 4 }, `Fill(${key}, +4)`);
              }}
              className="rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-3 py-1.5 text-emerald-700 dark:text-emerald-300 cursor-pointer"
            >
              + PartialFill(+4)
            </button>
            <button
              type="button"
              onClick={() => {
                const dupKey = order.executions[order.executions.length - 1] ?? 'f-dup';
                dispatch({ type: 'Fill', key: dupKey, qty: 4 }, `Fill(${dupKey}, +4) [重放]`);
              }}
              className="rounded-lg bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 px-3 py-1.5 text-violet-700 dark:text-violet-300 cursor-pointer"
            >
              + DupFill(重放)
            </button>
            <button
              type="button"
              onClick={() => {
                const rem = Math.max(1, order.totalQty - order.filledQty);
                const key = `f-${fillSeq}`;
                setFillSeq((s) => s + 1);
                dispatch({ type: 'Fill', key, qty: rem }, `Fill(${key}, +${rem})`);
              }}
              className="rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 px-3 py-1.5 text-emerald-800 dark:text-emerald-200 cursor-pointer"
            >
              + FillRest(余量全成)
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'CancelRequested' }, 'CancelRequested')}
              className="rounded-lg bg-slate-200/80 dark:bg-slate-800 hover:bg-amber-500/20 px-3 py-1.5 text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              + CancelReq
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'CancelAck' }, 'CancelAck')}
              className="rounded-lg bg-slate-200/80 dark:bg-slate-800 hover:bg-amber-500/20 px-3 py-1.5 text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              + CancelAck
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'Timeout' }, 'Timeout')}
              className="rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 px-3 py-1.5 text-rose-700 dark:text-rose-300 cursor-pointer"
            >
              + Timeout
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'Reject' }, 'Reject')}
              className="rounded-lg bg-slate-200/80 dark:bg-slate-800 hover:bg-rose-500/20 px-3 py-1.5 text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              + Reject
            </button>
            <button
              type="button"
              onClick={() => {
                const key = `over-${fillSeq}`;
                setFillSeq((s) => s + 1);
                dispatch({ type: 'Fill', key, qty: 20 }, `Fill(${key}, +20) [超额]`);
              }}
              className="rounded-lg bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 px-3 py-1.5 text-rose-700 dark:text-rose-300 cursor-pointer"
            >
              + Overfill(+20)
            </button>
          </div>
        </div>

        {/* Transition Audit Log */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0b1017] p-3.5 max-h-52 overflow-y-auto space-y-2">
          {logs.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-4">
              点击上方预设场景或任意事件按钮，观察状态机与风险锁的实时演进
            </div>
          ) : (
            logs.map((entry) => (
              <div
                key={entry.step}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  entry.outcome === 'error'
                    ? 'border-rose-500/35 bg-rose-500/8 text-rose-800 dark:text-rose-200'
                    : entry.outcome === 'dedup'
                      ? 'border-violet-500/35 bg-violet-500/8 text-violet-800 dark:text-violet-200'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] mb-0.5">
                  <span className="font-bold">
                    #{entry.step} {entry.eventLabel}
                  </span>
                  <span>
                    {entry.from} → <strong>{entry.to}</strong> (filled={entry.filledAfter})
                  </span>
                </div>
                <div className="opacity-90">{entry.note}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
