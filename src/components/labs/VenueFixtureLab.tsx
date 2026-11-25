import React, { useState } from 'react';
import { markLabComplete } from '../../lib/progress';

interface FixtureCase {
  id: string;
  label: string;
  rawJson: string;
  ok: boolean;
  normalized: string;
  note: string;
}

const FIXTURES: FixtureCase[] = [
  {
    id: 'ok',
    label: '正常深度增量 (Binance 风格)',
    rawJson: `{
  "E": 1710000000123,
  "s": "BTCUSDT",
  "U": 101,
  "u": 102,
  "b": [["60000.50", "1.250"]],
  "a": [["60001.00", "0.750"]]
}`,
    ok: true,
    normalized: `Ok(NormalizedDepthDelta {
  symbol: "BTCUSDT",
  event_time_ms: 1710000000123,
  delta: Delta {
    first_sequence: 101,
    last_sequence: 102,
    bids: [(PriceTicks(6000050), 1250)],
    asks: [(PriceTicks(6000100), 750)],
  }
})`,
    note: '字符串小数按 DecimalScale(price=2, qty=3) 严格无损解析为整数 ticks/lots，全程零 f64 浮点误差。',
  },
  {
    id: 'too-precise',
    label: '精度超标漂移 (TooPrecise)',
    rawJson: `{
  "E": 1710000000456,
  "s": "BTCUSDT",
  "U": 103,
  "u": 103,
  "b": [["60000.505", "1.000"]],
  "a": []
}`,
    ok: false,
    normalized: `Err(FixtureError::TooPrecise {
  value: "60000.505",
  decimals: 2
})`,
    note: '交易所悄悄把合约最小跳动位从 0.01 改成了 0.005！绝不静默四舍五入，直接拒绝并触发告警。',
  },
  {
    id: 'zero-price',
    label: '零价格脏包 (ZeroPrice)',
    rawJson: `{
  "E": 1710000000789,
  "s": "BTCUSDT",
  "U": 104,
  "u": 104,
  "b": [["0.00", "5.000"]],
  "a": []
}`,
    ok: false,
    normalized: `Err(FixtureError::ZeroPrice)`,
    note: 'PriceTicks::new(0) 在领域类型构造边界直接拦死，零价格永远进不了订单簿。',
  },
  {
    id: 'missing-field',
    label: '协议字段改名/缺失 (InvalidJson)',
    rawJson: `{
  "E": 1710000000999,
  "symbol": "BTCUSDT",
  "U": 105,
  "u": 105,
  "b": [],
  "a": []
}`,
    ok: false,
    normalized: `Err(FixtureError::InvalidJson(
  "missing field \`s\` at line 8 column 1"
))`,
    note: '交易所把字段 "s" 改名成 "symbol"：serde 强类型反序列化在入口立刻报错，不会像弱类型脚本那样读出 undefined。',
  },
];

export default function VenueFixtureLab() {
  const [active, setActive] = useState(FIXTURES[0]);

  return (
    <div className="my-8 rounded-2xl border border-amber-500/35 bg-white dark:bg-[#0e1520] shadow-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${active.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            交互实验室 · 交易所原始 JSON → 标准化事件映射器
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-500">DecimalScale(price=2, qty=3)</span>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {FIXTURES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setActive(f);
                markLabComplete('lab-venue-fixture');
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border ${
                active.id === f.id
                  ? f.ok
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-rose-600 text-white border-rose-600'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-amber-500/50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl bg-[#0d1117] border border-slate-800 overflow-hidden">
            <div className="px-3.5 py-2 text-[11px] font-mono text-slate-400 border-b border-slate-800">
              输入：交易所原始 WS JSON
            </div>
            <pre className="m-0! p-3.5 text-xs text-sky-200 overflow-x-auto bg-transparent! border-0!">
              <code>{active.rawJson}</code>
            </pre>
          </div>

          <div className={`rounded-xl bg-[#0d1117] border overflow-hidden ${active.ok ? 'border-emerald-500/40' : 'border-rose-500/40'}`}>
            <div className={`px-3.5 py-2 text-[11px] font-mono border-b ${active.ok ? 'text-emerald-300 border-emerald-500/25' : 'text-rose-300 border-rose-500/25'}`}>
              输出：venue_fixture::decode_delta()
            </div>
            <pre className={`m-0! p-3.5 text-xs overflow-x-auto bg-transparent! border-0! ${active.ok ? 'text-emerald-200' : 'text-rose-300'}`}>
              <code>{active.normalized}</code>
            </pre>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
          <strong>边界说明：</strong> {active.note}
        </div>
      </div>
    </div>
  );
}
