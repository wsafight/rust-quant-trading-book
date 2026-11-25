import React, { useState } from 'react';
import { markLabComplete } from '../../lib/progress';

interface BookState {
  valid: boolean;
  seq: number | null;
  bestBid: number;
  bestAsk: number;
  staleMs: number;
  reason: string;
}

interface FeedLog {
  id: number;
  event: string;
  outcome: 'ok' | 'warn' | 'err';
  detail: string;
}

const INITIAL: BookState = {
  valid: true,
  seq: 100,
  bestBid: 100.0,
  bestAsk: 100.1,
  staleMs: 12,
  reason: 'Healthy Snapshot(seq=100)',
};

export default function MarketDataSyncLab() {
  const [book, setBook] = useState<BookState>(INITIAL);
  const [logs, setLogs] = useState<FeedLog[]>([]);
  const [step, setStep] = useState(1);

  const pushLog = (event: string, outcome: 'ok' | 'warn' | 'err', detail: string) => {
    setLogs((prev) => [{ id: step, event, outcome, detail }, ...prev].slice(0, 8));
    setStep((s) => s + 1);
    markLabComplete('lab-market-data-sync');
  };

  const injectNormalDelta = () => {
    if (!book.valid || book.seq === null) {
      pushLog('Delta(next)', 'err', 'BookError::InvalidBook — 盘口已作废，拒绝增量，必须等待全量 Snapshot！');
      return;
    }
    const nextSeq = book.seq + 1;
    const nextBid = Number((book.bestBid + 0.05).toFixed(2));
    const nextAsk = Number((nextBid + 0.1).toFixed(2));
    setBook({ valid: true, seq: nextSeq, bestBid: nextBid, bestAsk: nextAsk, staleMs: 8, reason: `Delta seq=${nextSeq} 连续同步` });
    pushLog(`Delta(seq=${nextSeq})`, 'ok', `序列连续 (${book.seq} → ${nextSeq})，更新买一 ${nextBid} / 卖一 ${nextAsk}`);
  };

  const injectSeqGap = () => {
    const gapSeq = (book.seq ?? 100) + 5;
    setBook((prev) => ({
      ...prev,
      valid: false,
      reason: `SequenceGap: expected ${(prev.seq ?? 100) + 1}, got ${gapSeq}`,
    }));
    pushLog(
      `Delta(seq=${gapSeq}) [丢包跳号]`,
      'err',
      `BookError::SequenceGap — 立即将 valid 置为 false！禁止继续用残缺盘口报价。`
    );
  };

  const injectStaleDelta = () => {
    if (!book.valid || book.seq === null) {
      pushLog('OldDelta(seq=98)', 'warn', '盘口当前已作废，旧包忽略');
      return;
    }
    const oldSeq = book.seq - 2;
    pushLog(`OldDelta(seq=${oldSeq})`, 'warn', `last_sequence=${book.seq} >= ${oldSeq}，幂等跳过陈旧增量包，盘口保持健康。`);
  };

  const injectCrossedBook = () => {
    setBook((prev) => ({
      ...prev,
      valid: false,
      bestBid: 100.25,
      bestAsk: 100.1,
      reason: 'CrossedBook: bid(100.25) >= ask(100.10)',
    }));
    pushLog(
      'Delta(bid=100.25, ask=100.10) [盘口倒挂]',
      'err',
      'BookError::CrossedBook — 买一高于卖一，立刻作废整张盘口并阻断下游风控！'
    );
  };

  const injectClockLag = () => {
    setBook((prev) => ({
      ...prev,
      staleMs: 2450,
      reason: 'StaleMarketData: 行情心跳滞后 2450ms > 阈值 500ms',
    }));
    pushLog('FeedStall(2450ms)', 'err', '结构有效但数据过期！风控层触发 RiskRejectReason::StaleMarketData。');
  };

  const resyncSnapshot = () => {
    const freshSeq = (book.seq ?? 100) + 10;
    setBook({
      valid: true,
      seq: freshSeq,
      bestBid: 100.2,
      bestAsk: 100.3,
      staleMs: 10,
      reason: `Resync Snapshot(seq=${freshSeq}) 原子替换完成`,
    });
    pushLog(`Snapshot(seq=${freshSeq})`, 'ok', '在临时 BTreeMap 校验通过后原子替换，盘口恢复可交易状态。');
  };

  const isTradable = book.valid && book.staleMs <= 500;

  return (
    <div className="my-8 rounded-2xl border border-emerald-500/30 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${isTradable ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · 行情增量同步故障注入器（Snapshot + Delta）
          </span>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-mono font-bold ${
            isTradable
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
          }`}
        >
          {isTradable ? 'TRADABLE · 可交易' : 'BLOCKED · 已阻断下单'}
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Live Book Status */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] text-slate-500">结构有效 (valid)</div>
            <div className={`mt-1 font-mono text-base font-bold ${book.valid ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {String(book.valid)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] text-slate-500">last_sequence</div>
            <div className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-white">
              {book.seq ?? 'None'}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] text-slate-500">best_bid / best_ask</div>
            <div className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-white">
              {book.valid ? `${book.bestBid.toFixed(2)} / ${book.bestAsk.toFixed(2)}` : 'None / None'}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
            <div className="text-[11px] text-slate-500">数据滞后 (Staleness)</div>
            <div className={`mt-1 font-mono text-base font-bold ${book.staleMs > 500 ? 'text-rose-500' : 'text-emerald-500'}`}>
              {book.staleMs} ms
            </div>
          </div>
        </div>

        {/* Fault Injection Buttons */}
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          <button type="button" onClick={injectNormalDelta} className="rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 px-3 py-1.5 text-emerald-700 dark:text-emerald-300 cursor-pointer">
            + 正常连续 Delta
          </button>
          <button type="button" onClick={injectStaleDelta} className="rounded-lg bg-slate-200/80 dark:bg-slate-800 hover:bg-sky-500/20 px-3 py-1.5 text-slate-800 dark:text-slate-200 cursor-pointer">
            + 重复旧序号 Delta
          </button>
          <button type="button" onClick={injectSeqGap} className="rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 px-3 py-1.5 text-rose-700 dark:text-rose-300 cursor-pointer">
            ⚡ 注入 Sequence Gap
          </button>
          <button type="button" onClick={injectCrossedBook} className="rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 px-3 py-1.5 text-rose-700 dark:text-rose-300 cursor-pointer">
            ⚡ 注入盘口倒挂
          </button>
          <button type="button" onClick={injectClockLag} className="rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 px-3 py-1.5 text-amber-800 dark:text-amber-300 cursor-pointer">
            ⚡ 注入行情卡顿 (2.4s)
          </button>
          <button type="button" onClick={resyncSnapshot} className="rounded-lg bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-white font-semibold cursor-pointer">
            ↻ 拉取全量 Snapshot 重建
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0b1017] p-3.5 max-h-48 overflow-y-auto space-y-2">
          {logs.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-3">
              先点「注入 Sequence Gap」，再尝试点「正常连续 Delta」——观察为什么必须拉取全量 Snapshot 才能恢复！
            </div>
          ) : (
            logs.map((l) => (
              <div
                key={l.id}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  l.outcome === 'err'
                    ? 'border-rose-500/35 bg-rose-500/8 text-rose-800 dark:text-rose-200'
                    : l.outcome === 'warn'
                      ? 'border-amber-500/35 bg-amber-500/8 text-amber-800 dark:text-amber-200'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span className="font-mono font-bold mr-2">#{l.id} {l.event}</span>
                <span>{l.detail}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
