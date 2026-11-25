import React, { useState } from 'react';
import { markLabComplete } from '../../lib/progress';

interface DrillStep {
  id: string;
  title: string;
  stage: string;
  outcome: string;
  healthy: boolean;
}

const DRILLS: DrillStep[] = [
  {
    id: 'fill-before-ack',
    title: '① Fill-Before-Ack（成交先于确认）',
    stage: 'OMS + Ledger',
    outcome: 'OMS 状态直接推进至 Filled，随后到达的迟到 NewAck 被静默吸收；Ledger 记账 +2 手，权益闭合。',
    healthy: true,
  },
  {
    id: 'duplicate-fill',
    title: '② Duplicate Fill（重连重复成交）',
    stage: 'OMS + Ledger',
    outcome: 'ExecutionKey 去重触发：OMS 与 Ledger 均返回幂等忽略，持仓维持 +2 手绝不翻倍。',
    healthy: true,
  },
  {
    id: 'seq-gap',
    title: '③ Sequence Gap（行情跳号丢包）',
    stage: 'Book → Hard Risk',
    outcome: 'OrderBook 立即 valid=false，硬风控对后续新单返回 Reject(UntradableBook)，直到全量 Snapshot 重建恢复。',
    healthy: true,
  },
  {
    id: 'cancel-timeout',
    title: '④ Cancel Timeout → Uncertain 锁',
    stage: 'OMS → Hard Risk',
    outcome: '撤单超时将订单锁入 Uncertain，硬风控按最坏敞口计入 worst_long/worst_short，禁止重复发单。',
    healthy: true,
  },
  {
    id: 'reconcile',
    title: '⑤ 重启对账恢复（Reconcile）',
    stage: 'Full Pipeline',
    outcome: '拉取交易所权威订单与成交快照，解除 Uncertain 锁并校验 Cash + Pos×Mark == Init + Realized + Unrealized - Fees。',
    healthy: true,
  },
];

export default function E2eFaultRecoveryLab() {
  const [completed, setCompleted] = useState<string[]>([]);
  const [current, setCurrent] = useState<DrillStep | null>(null);

  const runDrill = (d: DrillStep) => {
    setCurrent(d);
    setCompleted((prev) => (prev.includes(d.id) ? prev : [...prev, d.id]));
    markLabComplete('lab-e2e-fault-recovery');
  };

  const runAll = () => {
    setCompleted(DRILLS.map((d) => d.id));
    setCurrent(DRILLS[DRILLS.length - 1]);
    markLabComplete('lab-e2e-fault-recovery');
  };

  return (
    <div className="my-8 rounded-2xl border border-emerald-500/35 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · 全链路故障注入与灾难演练台（镜像 code/src/bin/demo.rs）
          </span>
        </div>
        <button
          type="button"
          onClick={runAll}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-xs font-semibold text-white cursor-pointer"
        >
          一键跑完全部 5 项灾难演练
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Pipeline Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-xs">
          {['Feed 行情', 'OrderBook', 'Hard Risk', 'OMS 状态机', 'Double-Entry Ledger'].map((node, idx) => (
            <React.Fragment key={node}>
              <span className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-300 font-semibold">
                {node}
              </span>
              {idx < 4 && <span className="text-slate-400">→</span>}
            </React.Fragment>
          ))}
        </div>

        {/* Drill Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {DRILLS.map((d) => {
            const done = completed.includes(d.id);
            const active = current?.id === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => runDrill(d)}
                className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                  active
                    ? 'border-emerald-500 bg-emerald-500/12'
                    : done
                      ? 'border-emerald-500/35 bg-emerald-500/5'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 hover:border-emerald-500/40'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-white">
                  <span>{d.title}</span>
                  {done && <span className="text-emerald-500 font-mono">✓</span>}
                </div>
                <div className="mt-1 font-mono text-[11px] text-slate-500">{d.stage}</div>
              </button>
            );
          })}
        </div>

        {current ? (
          <div className="rounded-xl border border-emerald-500/35 bg-emerald-50/70 dark:bg-emerald-950/25 p-4 text-xs leading-relaxed text-slate-800 dark:text-slate-200">
            <div className="font-mono font-bold text-emerald-700 dark:text-emerald-300 mb-1">
              演练通过 · {current.title}（{completed.length} / {DRILLS.length}）
            </div>
            <div>{current.outcome}</div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-4 text-xs text-slate-500 text-center">
            点击上方任意故障演练卡片，或点右上角「一键跑完全部 5 项灾难演练」查看全链路容错闭环。
          </div>
        )}
      </div>
    </div>
  );
}
