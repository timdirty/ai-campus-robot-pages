import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Clock, Calendar, CheckCircle2, ChevronRight, MapPin, Search, Wind, Save } from 'lucide-react';
import { useAppActions, useAppState } from '../state/AppStateProvider';

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;

export function TaskScheduleView({ goBack, showToast }: {goBack: () => void; showToast: (msg: string) => void}) {
  const state = useAppState();
  const actions = useAppActions();
  const schedule = state.schedules[0];
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]);
  const [startTime, setStartTime] = useState(schedule?.time ?? '16:30');
  const [area, setArea] = useState(schedule?.area ?? '所有走廊與公共區');

  const toggleDay = (d: number) => {
    setSelectedDays(prev => {
      if (prev.includes(d) && prev.length === 1) return prev;
      return prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d];
    });
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-outline-variant/20 px-4 py-4 flex items-center justify-between">
        <button aria-label="返回" onClick={goBack} className="p-2 rounded-full bg-surface-container-low active:scale-95 transition-transform text-on-surface">
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-headline font-bold text-xl absolute left-1/2 -translate-x-1/2">排程管理</h1>
        <div className="w-10"></div>
      </header>

      <main className="p-6 space-y-8">
        <section className="space-y-4">
          <div className="flex items-center gap-5 border-b border-outline-variant/30 pb-8 mb-8">
            <div className="w-20 h-20 rounded-[1.5rem] bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shadow-inner">
              <Wind size={36} />
            </div>
            <div className="py-2">
              <p className="text-xs text-primary font-bold mb-1.5">新增排程</p>
              <h2 className="text-3xl font-headline font-bold text-on-surface tracking-tight">教室定時清潔</h2>
            </div>
          </div>

          <h3 className="font-bold text-on-surface-variant text-xs px-2">執行區域</h3>
          <div className="bg-surface-container-low rounded-[1.75rem] p-6 border border-outline-variant/20 flex justify-between items-center shadow-sm">
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/10">
                  <MapPin size={20} />
                </div>
                <div>
                   <p className="font-bold text-lg tracking-wide">{area}</p>
                   <p className="text-[13px] text-on-surface-variant font-medium mt-1">已同步至生活中心排程</p>
                </div>
             </div>
             <ChevronRight size={24} className="text-on-surface-variant/40" />
          </div>
        </section>

        <section className="space-y-4 pt-2">
          <h3 className="font-bold text-on-surface-variant text-xs px-2">執行時間</h3>
          <div className="grid grid-cols-2 gap-5">
             <div className="bg-surface-container-lowest p-6 rounded-[1.75rem] border border-outline-variant/30 shadow-sm relative overflow-hidden group hover:border-primary/30 transition-colors">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
                <p className="text-[11px] font-bold text-on-surface-variant mb-3 relative z-10">開始時間</p>
                <div className="flex items-center gap-3 relative z-10">
                   <Clock className="text-primary" size={24} />
                   <input
                     type="time"
                     value={startTime}
                     onChange={(event) => setStartTime(event.target.value)}
                     className="w-32 bg-transparent text-3xl font-bold tracking-tight outline-none"
                     aria-label="開始時間"
                   />
                </div>
             </div>
             <div className="bg-surface-container-lowest p-6 rounded-[1.75rem] border border-outline-variant/30 shadow-sm relative overflow-hidden group hover:border-outline-variant/50 transition-colors">
                <p className="text-[11px] font-bold text-on-surface-variant mb-3 relative z-10">結束時間</p>
                <div className="flex items-center gap-3 relative z-10">
                   <Clock className="text-on-surface-variant/40" size={24} />
                   <span className="text-3xl font-bold tracking-tight text-on-surface-variant/70">18:00</span>
                </div>
             </div>
          </div>
        </section>

        <section className="space-y-4 pt-2">
          <h3 className="font-bold text-on-surface-variant text-xs px-2">區域快速切換</h3>
          <select
            value={area}
            onChange={(event) => setArea(event.target.value)}
            className="w-full rounded-[1.5rem] border border-outline-variant/20 bg-surface-container-lowest px-5 py-4 text-base font-bold shadow-sm outline-none focus:ring-4 focus:ring-primary/10"
          >
            <option value="所有走廊與公共區">所有走廊與公共區</option>
            <option value="全校低年級教室">全校低年級教室</option>
            <option value="B 棟活動中心與操場">B 棟活動中心與操場</option>
          </select>
        </section>

        <section className="space-y-4 pt-2">
          <h3 className="font-bold text-on-surface-variant text-xs px-2">重複頻率</h3>
          <div className="flex justify-between items-center bg-surface-container-lowest p-3 rounded-[1.75rem] border border-outline-variant/20 shadow-sm">
             {DAY_LABELS.map((day, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-[15px] transition-all active:scale-90 ${selectedDays.includes(i) ? 'bg-primary text-white shadow-lg shadow-primary/30 ring-2 ring-primary/20 ring-offset-2 ring-offset-surface-container-lowest' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
                >
                  {day}
                </button>
             ))}
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-5 bg-background/95 backdrop-blur-3xl border-t border-outline-variant/30 pb-safe pb-6 z-50">
         <button onClick={() => { actions.saveSchedule({ id: schedule?.id ?? 'schedule1', time: startTime, area }); showToast('任務排程已儲存'); goBack(); }} className="w-full max-w-md mx-auto flex items-center justify-center gap-3 bg-primary hover:bg-primary/95 text-white font-bold text-[17px] tracking-wide py-5 rounded-[1.5rem] active:scale-[0.98] transition-all shadow-xl shadow-primary/20 hover:shadow-primary/30">
            <Save size={20} />
            儲存排程設定
         </button>
      </div>
    </div>
  );
}
