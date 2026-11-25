import React, { useState } from 'react';

interface QuizOption {
  label: string;
  text: string;
}

interface PredictQuizProps {
  question: string;
  options: QuizOption[];
  correctIndex: number;
  explanation: string;
}

export default function PredictQuiz({
  question,
  options,
  correctIndex,
  explanation,
}: PredictQuizProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const revealed = selected !== null;
  const isCorrect = selected === correctIndex;

  return (
    <div className="my-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1621] p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="rounded-md bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/25 px-2 py-0.5 text-[11px] font-semibold">
          先猜再看
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">检验你的交易直觉</span>
      </div>

      <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 mt-0! mb-4 leading-snug">
        {question}
      </p>

      <div className="space-y-2">
        {options.map((opt, idx) => {
          const isUserChoice = selected === idx;
          const isRight = idx === correctIndex;

          let style =
            'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 hover:border-violet-500/50 text-slate-800 dark:text-slate-200';
          if (revealed) {
            if (isRight) {
              style =
                'border-emerald-500/60 bg-emerald-500/12 text-emerald-900 dark:text-emerald-200 font-medium';
            } else if (isUserChoice) {
              style =
                'border-rose-500/60 bg-rose-500/12 text-rose-900 dark:text-rose-200';
            } else {
              style =
                'border-slate-200/60 dark:border-slate-800/60 opacity-60 text-slate-500 dark:text-slate-400';
            }
          }

          return (
            <button
              key={idx}
              type="button"
              onClick={() => setSelected(idx)}
              className={`w-full flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all cursor-pointer ${style}`}
            >
              <span className="font-mono text-xs font-bold mt-0.5 shrink-0 opacity-80">
                {opt.label}
              </span>
              <span className="flex-1">{opt.text}</span>
              {revealed && isRight && <span className="text-emerald-500 text-xs font-bold">✓</span>}
              {revealed && isUserChoice && !isRight && (
                <span className="text-rose-500 text-xs font-bold">✗</span>
              )}
            </button>
          );
        })}
      </div>

      {revealed && (
        <div
          className={`mt-4 rounded-xl border p-4 text-[13.5px] leading-relaxed ${
            isCorrect
              ? 'border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-950/25 text-slate-800 dark:text-slate-200'
              : 'border-amber-500/30 bg-amber-50/80 dark:bg-amber-950/25 text-slate-800 dark:text-slate-200'
          }`}
        >
          <div className="font-semibold mb-1 text-xs">
            {isCorrect ? '直觉准确！' : '差一点——看看真实机制：'}
          </div>
          <p className="m-0!">{explanation}</p>
        </div>
      )}
    </div>
  );
}
