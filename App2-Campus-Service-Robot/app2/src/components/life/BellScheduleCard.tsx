import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Clock } from 'lucide-react';
import {useAppActions, useAppState} from '../../state/AppStateProvider';

// Full school bell schedule — done/next computed from real time
const ALL_BELLS = [
  { label: '到校',  time: '07:50' },
  { label: '第1節', time: '08:00' },
  { label: '下課',  time: '08:40' },
  { label: '第2節', time: '08:50' },
  { label: '下課',  time: '09:30' },
  { label: '第3節', time: '09:40' },
  { label: '下課',  time: '10:20' },
  { label: '第4節', time: '10:40' },
  { label: '午餐',  time: '11:20' },
  { label: '午休',  time: '12:00' },
  { label: '第5節', time: '13:00' },
  { label: '下課',  time: '13:40' },
  { label: '第6節', time: '13:50' },
  { label: '放學',  time: '14:30' },
];

function toMins(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function computeBells() {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const afterSchool = nowMins >= toMins('14:30');

  // If after school, show tomorrow's schedule (all upcoming)
  const base = afterSchool
    ? ALL_BELLS.map(b => ({ ...b, done: false, next: false }))
    : ALL_BELLS.map(b => ({ ...b, done: toMins(b.time) <= nowMins, next: false }));

  // Mark first undone as "next"
  const nextIdx = base.findIndex(b => !b.done);
  if (nextIdx !== -1) base[nextIdx] = { ...base[nextIdx], next: true };

  // Show a window: 2 before next + next + 3 after
  const windowStart = Math.max(0, nextIdx === -1 ? base.length - 6 : nextIdx - 2);
  return base.slice(windowStart, windowStart + 6);
}

export function BellScheduleCard() {
  const state = useAppState();
  const actions = useAppActions();
  const [bellSchedule, setBellSchedule] = useState(computeBells);
  const remindWarning = state.settings.remindWarning;

  useEffect(() => {
    const intv = setInterval(() => setBellSchedule(computeBells()), 60_000);
    return () => clearInterval(intv);
  }, []);

  const firstUndoneIdx = bellSchedule.findIndex(b => !b.done);

  return (
    <div className="bg-surface-container-low rounded-2xl p-5 border border-outline-variant/30 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-primary" />
          <h3 className="font-headline text-sm font-bold">今日鐘聲時程</h3>
        </div>
        <button
          onClick={() => actions.setRemindWarning(!remindWarning)}
          className="flex items-center gap-2"
        >
          <span className="text-[10px] font-bold text-on-surface-variant/60">智慧提醒</span>
          <div className={`w-10 h-5 rounded-full relative border transition-all ${remindWarning ? 'bg-primary border-primary' : 'bg-surface-container-highest border-outline-variant/30'}`}>
            <motion.div
              layout
              animate={{ x: remindWarning ? 18 : 1 }}
              transition={{ type: 'spring', stiffness: 450, damping: 25 }}
              className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow"
            />
          </div>
        </button>
      </div>

      <div className="flex items-center gap-0.5 overflow-x-auto pb-1 scrollbar-hide">
        {bellSchedule.map((bell, i) => (
          <React.Fragment key={i}>
            <div className={`flex flex-col items-center shrink-0 gap-1 px-2.5 py-2 rounded-xl ${bell.next ? 'bg-primary/15 border border-primary/30' : ''}`}>
              <div className={`w-2.5 h-2.5 rounded-full border-2 transition-colors ${bell.done ? 'bg-primary border-primary' : bell.next ? 'bg-white border-primary animate-pulse' : 'bg-transparent border-outline-variant/40'}`} />
              <p className={`text-[9px] font-bold font-mono whitespace-nowrap ${bell.done ? 'text-primary/50' : bell.next ? 'text-primary' : 'text-on-surface-variant/40'}`}>{bell.time}</p>
              <p className={`text-[9px] font-bold whitespace-nowrap ${bell.done ? 'text-on-surface-variant/40 line-through' : bell.next ? 'text-on-surface font-extrabold' : 'text-on-surface-variant/50'}`}>{bell.label}</p>
            </div>
            {i < bellSchedule.length - 1 && (
              <div className={`h-px flex-1 min-w-2 shrink-0 ${i < firstUndoneIdx ? 'bg-primary/30' : 'bg-outline-variant/20'}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
