import React, { useMemo, useState, useEffect } from 'react';
import { markLabComplete } from '../../lib/progress';

export default function BackpressureLatencyLab() {
  const [burstRate, setBurstRate] = useState(4000); // msg/s
  const [consumerRate, setConsumerRate] = useState(2500); // msg/s
  const [policy, setPolicy] = useState<'blocking' | 'drop-oldest'>('blocking');
  const [touched, setTouched] = useState(false);

  const stats = useMemo(() => {
    const overload = Math.max(0, burstRate - consumerRate);
    if (policy === 'blocking') {
      // Queue builds up over a 3-second burst
      const backlog = overload * 3;
      const p50Ms = 0.8 + (backlog / consumerRate) * 260;
      const p99Ms = 2.5 + (backlog / consumerRate) * 950;
      return {
        backlog,
        p50Ms,
        p99Ms,
        dropped: 0,
        staleAlert: p99Ms > 100,
      };
    } else {
      // Bounded latest-only / drop-oldest keeps queue depth <= 16
      const dropped = overload * 3;
      return {
        backlog: Math.min(16, Math.ceil(burstRate / 500)),
        p50Ms: 0.6,
        p99Ms: 3.2 + (burstRate / 4000) * 1.4,
        dropped,
        staleAlert: false,
      };
    }
  }, [burstRate, consumerRate, policy]);

  useEffect(() => {
    if (touched) markLabComplete('lab-backpressure-p99');
  }, [touched]);

  return (
    <div className="my-8 rounded-2xl border border-amber-500/35 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${stats.staleAlert ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`} />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · 行情洪峰背压与 P50 / P99 长尾延迟模拟器
          </span>
        </div>
        <div className="flex gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => { setPolicy('blocking'); setTouched(true); }}
            className={`rounded-lg px-2.5 py-1 font-medium cursor-pointer ${policy === 'blocking' ? 'bg-rose-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
          >
            无界/阻塞排队（FIFO）
          </button>
          <button
            type="button"
            onClick={() => { setPolicy('drop-oldest'); setTouched(true); }}
            className={`rounded-lg px-2.5 py-1 font-medium cursor-pointer ${policy === 'drop-oldest' ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
          >
            有界丢旧保新（Latest-Only）
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">行情洪峰速率 (3s 突发)</span>
              <span className="font-mono font-bold text-rose-500">{burstRate} msg/s</span>
            </div>
            <input type="range" min={1000} max={8000} step={250} value={burstRate} onChange={(e) => { setBurstRate(Number(e.target.value)); setTouched(true); }} className="w-full accent-rose-500" />
          </label>
          <label className="block">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">策略线程吞吐上限</span>
              <span className="font-mono font-bold text-emerald-500">{consumerRate} msg/s</span>
            </div>
            <input type="range" min={1000} max={6000} step={250} value={consumerRate} onChange={(e) => { setConsumerRate(Number(e.target.value)); setTouched(true); }} className="w-full accent-emerald-500" />
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] font-sans text-slate-500">P50 中位延迟</div>
            <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">{stats.p50Ms.toFixed(1)} ms</div>
          </div>
          <div className={`rounded-xl border p-3 ${stats.staleAlert ? 'border-rose-500/40 bg-rose-500/10' : 'border-emerald-500/30 bg-emerald-500/8'}`}>
            <div className="text-[11px] font-sans text-slate-500">P99 尾延迟</div>
            <div className={`mt-1 text-base font-bold ${stats.staleAlert ? 'text-rose-500' : 'text-emerald-500'}`}>
              {stats.p99Ms.toFixed(1)} ms
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] font-sans text-slate-500">队列积压量</div>
            <div className="mt-1 text-base font-bold text-amber-500">{stats.backlog} 条</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] font-sans text-slate-500">主动丢弃旧快照</div>
            <div className="mt-1 text-base font-bold text-sky-500">{stats.dropped} 条</div>
          </div>
        </div>

        <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${stats.staleAlert ? 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200' : 'border-emerald-500/30 bg-emerald-500/8 text-slate-700 dark:text-slate-200'}`}>
          {stats.staleAlert
            ? '队列雪崩！行情洪峰超过消费速率后，FIFO 队列里积压了大量 1 秒前的过期价格。你用 P99 延迟高达数百毫秒的陈旧盘口去报价，等于白白给全市场送钱。'
            : '行情快照流（非订单回报！）允许「丢旧保新」：把队列封顶并只保留最新盘口，牺牲过期中间帧，换取 P99 延迟稳定在个位数毫秒内！'}
        </div>
      </div>
    </div>
  );
}
