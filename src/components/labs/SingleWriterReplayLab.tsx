import React, { useState } from 'react';
import { markLabComplete } from '../../lib/progress';

const STEPS = {
  rwlock: [
    { t: 't=100ns', actor: '策略线程', action: '加读锁读 Book：best_bid=100.00（释放读锁）', bug: false },
    { t: 't=105ns', actor: '回报线程', action: '抢占写锁：收到 Fill(+5)，Position 从 0 更新为 +5', bug: false },
    { t: 't=108ns', actor: '策略线程', action: '拿着旧盘口 + 刚读到的旧仓位(0) 决策：再次买入 +5！', bug: true },
    { t: 't=110ns', actor: '结果', action: '💥 撕裂快照事故：实际持仓变成 +10（超仓一倍），且无法 100% 复现！', bug: true },
  ],
  single: [
    { t: 'seq=1 (100ns)', actor: '单写者队列', action: '出队事件 #1：BookDelta(best_bid=100.00)，更新本地 Book', bug: false },
    { t: 'seq=2 (105ns)', actor: '单写者队列', action: '出队事件 #2：Fill(+5)，原子更新本地 Position=5', bug: false },
    { t: 'seq=3 (108ns)', actor: '单写者队列', action: '出队事件 #3：StrategyTick，在同一线程看到一致的 (Book, Pos=5)，跳过加仓', bug: false },
    { t: 'seq=4 (回放)', actor: 'Replay 引擎', action: '✓ 相同 (at_ns, priority, local_sequence) 序列重放 1000 次，结果逐字节一致！', bug: false },
  ],
};

export default function SingleWriterReplayLab() {
  const [mode, setMode] = useState<'rwlock' | 'single'>('rwlock');
  const [stepIdx, setStepIdx] = useState(0);

  const list = STEPS[mode];

  const handleMode = (m: 'rwlock' | 'single') => {
    setMode(m);
    setStepIdx(0);
    markLabComplete('lab-single-writer-replay');
  };

  return (
    <div className="my-8 rounded-2xl border border-amber-500/35 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${mode === 'single' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · 共享大锁撕裂快照 vs 单写者确定性步进器
          </span>
        </div>
        <div className="flex gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => handleMode('rwlock')}
            className={`rounded-lg px-2.5 py-1 font-medium cursor-pointer ${mode === 'rwlock' ? 'bg-rose-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
          >
            Arc&lt;RwLock&gt; 多线程共享锁
          </button>
          <button
            type="button"
            onClick={() => handleMode('single')}
            className={`rounded-lg px-2.5 py-1 font-medium cursor-pointer ${mode === 'single' ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
          >
            Single-Writer 单写者事件循环
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">当前步进：{stepIdx + 1} / {list.length}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setStepIdx((i) => Math.max(0, i - 1)); markLabComplete('lab-single-writer-replay'); }}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1 text-xs cursor-pointer"
            >
              ← 上一步
            </button>
            <button
              type="button"
              onClick={() => { setStepIdx((i) => Math.min(list.length - 1, i + 1)); markLabComplete('lab-single-writer-replay'); }}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 text-xs font-semibold cursor-pointer"
            >
              单步执行 →
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {list.slice(0, stepIdx + 1).map((item, i) => (
            <div
              key={i}
              className={`rounded-xl border px-4 py-3 text-xs ${
                item.bug
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between font-mono text-[11px] mb-1 opacity-80">
                <span>{item.t}</span>
                <span className="font-bold">{item.actor}</span>
              </div>
              <div>{item.action}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
