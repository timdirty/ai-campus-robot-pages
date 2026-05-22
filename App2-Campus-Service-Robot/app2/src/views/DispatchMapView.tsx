import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Bot, CheckCircle2, Navigation, ShieldAlert, Zap, Target, Users, MapPin } from 'lucide-react';
import { useAppActions } from '../state/AppStateProvider';
import { generateDispatchRecommendation } from '../services/localAi';
import type { DispatchTaskType } from '../state/appState';

const ZONE_META = {
  A: {name: '行政走廊', signal: '訪客引導', risk: '一般', robotX: -118, robotY: -138, metric: '訪客 6', action: '引導路線'},
  B: {name: '中庭熱區', signal: '人流偏高', risk: '高', robotX: 112, robotY: 56, metric: '人流 82', action: '柔性疏導'},
  C: {name: '圖書角', signal: '安靜巡查', risk: '低', robotX: -74, robotY: 148, metric: '安靜', action: '保持巡查'},
} as const;

const DISPATCH_PROGRESS: Record<string, number> = {
  '待命': 0, '確認區域': 28, '機器人出勤': 68, '任務回報': 100,
};

const DISPATCH_STAGES = ['確認區域', '機器人出勤', '任務回報'] as const;

export function DispatchMapView({ goBack, showToast }: {goBack: () => void; showToast: (msg: string) => void}) {
  const actions = useAppActions();
  const [selectedZone, setSelectedZone] = useState('none');
  const [taskType, setTaskType] = useState<DispatchTaskType>('patrol');
  const [recommendation, setRecommendation] = useState('');
  const [recommendationError, setRecommendationError] = useState(false);
  const [dispatchingZone, setDispatchingZone] = useState('');
  const [dispatchStage, setDispatchStage] = useState<'待命' | '確認區域' | '機器人出勤' | '任務回報'>('待命');
  const [dispatchComplete, setDispatchComplete] = useState(false);
  const [missionId, setMissionId] = useState('');
  const [missionLog, setMissionLog] = useState<string[]>(['S-01 待命，選擇區域後開始服務。']);

  const pendingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      for (const t of pendingTimers.current) clearTimeout(t);
    };
  }, []);

  const activeZone = selectedZone === 'A' || selectedZone === 'B' || selectedZone === 'C' ? ZONE_META[selectedZone] : null;
  const dispatchProgress = DISPATCH_PROGRESS[dispatchStage] ?? 0;

  const handleDispatch = async () => {
    if (selectedZone === 'none' || dispatchingZone) return;
    const dispatchType: DispatchTaskType = taskType === 'broadcast' ? 'broadcast' : 'patrol';
    setDispatchingZone(selectedZone);
    setDispatchComplete(false);
    const nextMissionId = `S-${Date.now().toString().slice(-4)}`;
    setMissionId(nextMissionId);
    setDispatchStage('確認區域');
    setMissionLog([`${nextMissionId} 已建立`, `鎖定${activeZone?.name ?? `區域 ${selectedZone}`}`]);
    const t1 = setTimeout(() => {
      setDispatchStage('機器人出勤');
      setMissionLog((items) => [`S-01 正在前往${activeZone?.name ?? `區域 ${selectedZone}`}`, ...items]);
    }, 650);
    const t2 = setTimeout(() => {
      setDispatchStage('任務回報');
      setMissionLog((items) => ['現場狀態已回傳，任務可追蹤。', ...items]);
    }, 1350);
    pendingTimers.current.push(t1, t2);
    try {
      const message = await generateDispatchRecommendation(selectedZone, dispatchType);
      setRecommendation(message);
      setRecommendationError(false);
    } catch {
      const zoneName = activeZone?.name ?? `區域 ${selectedZone}`;
      setRecommendation(`雲端 AI 未即時回覆，已切換本機派遣建議：校園服務機 R-01 前往 ${zoneName} ${dispatchType === 'broadcast' ? '發送慢行與分流廣播' : '巡查主要動線並回傳現場狀態'}。`);
      setRecommendationError(false);
    }
    actions.addDispatchTask({ zone: selectedZone, taskType: dispatchType });
    showToast(`機器人已出發前往區域 ${selectedZone} 執行任務`);
    const t3 = setTimeout(() => {
      actions.completeDispatchTask({ zone: selectedZone, taskType: dispatchType });
      setDispatchComplete(true);
      setMissionLog((items) => ['任務完成，已同步到任務中控。', ...items]);
    }, 1500);
    pendingTimers.current.push(t3);
  };

  const resetDispatch = () => {
    setDispatchingZone('');
    setDispatchStage('待命');
    setDispatchComplete(false);
    setMissionId('');
    setSelectedZone('none');
    setRecommendation('');
    setRecommendationError(false);
    setMissionLog(['S-01 待命，選擇區域後開始服務。']);
  };

  const handleScanHotZone = () => {
    if (dispatchingZone) return;
    setSelectedZone('B');
    setTaskType('broadcast');
    setRecommendation('掃描完成：中庭熱區人流偏高，建議派 S-01 先做柔性疏導，再回傳現場狀態。');
    setMissionLog(['已自動選取中庭熱區', '建議任務：柔性疏導']);
    showToast('已鎖定中庭熱區');
  };

  return (
    <div className="min-h-screen bg-[#f4f8fb] text-slate-950 pb-32">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-2xl border-b border-slate-200 px-6 py-5 flex items-center justify-between">
        <button aria-label="返回" onClick={goBack} className="w-11 h-11 rounded-2xl bg-slate-50 active:scale-90 transition-all flex items-center justify-center border border-slate-200 shadow-sm">
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-headline font-bold text-xl absolute left-1/2 -translate-x-1/2 tracking-tight">校園派遣</h1>
        <button onClick={handleScanHotZone} disabled={Boolean(dispatchingZone)} className="w-11 h-11 rounded-2xl bg-primary/10 text-primary active:scale-90 transition-all flex items-center justify-center border border-primary/20 shadow-sm disabled:opacity-40" aria-label="掃描熱區">
          <Target size={24} />
        </button>
      </header>

      <main className="p-6 space-y-8 max-w-lg mx-auto">

        <div className="w-full aspect-[4/5] bg-white rounded-4xl border border-slate-200 relative overflow-hidden shadow-xl shadow-slate-200/70 group">
           <div className="absolute inset-0 opacity-70" style={{ backgroundImage: 'linear-gradient(rgba(14,165,163,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,163,0.08) 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
           <div className="absolute left-[13%] top-[28%] h-3 w-[74%] -rotate-6 rounded-full bg-cyan-100" />
           <div className="absolute left-[16%] top-[65%] h-3 w-[62%] rotate-3 rounded-full bg-cyan-100" />
           <div className="absolute left-[51%] top-[17%] h-[62%] w-3 rounded-full bg-cyan-100" />

           <motion.div animate={{ rotate: 360 }} transition={{ duration: 7, repeat: Infinity, ease: 'linear' }} className="absolute inset-0 z-0 origin-center scale-[1.5] opacity-35">
             <div className="w-1/2 h-1/2 bg-linear-to-br from-primary/30 to-transparent absolute top-0 left-1/2 origin-bottom-left" style={{ clipPath: 'polygon(0% 100%, 100% 0%, 100% 100%)' }}></div>
           </motion.div>

           <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-30">
              <div className="w-20 h-20 border border-primary rounded-full"></div>
              <div className="w-1 h-32 bg-primary absolute left-1/2 -top-6 -translate-x-1/2"></div>
              <div className="h-1 w-32 bg-primary absolute top-1/2 -left-6 -translate-y-1/2"></div>
           </div>

           <motion.div
             animate={{
               x: dispatchingZone === 'A' ? ZONE_META.A.robotX : dispatchingZone === 'B' ? ZONE_META.B.robotX : dispatchingZone === 'C' ? ZONE_META.C.robotX : 0,
               y: dispatchingZone === 'A' ? ZONE_META.A.robotY : dispatchingZone === 'B' ? ZONE_META.B.robotY : dispatchingZone === 'C' ? ZONE_META.C.robotY : 0,
               scale: dispatchingZone === 'none' || !dispatchingZone ? 1 : 1.12,
             }}
             transition={{ type: 'spring', damping: 18, stiffness: 120 }}
             className={`absolute left-1/2 top-1/2 z-30 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[1.6rem] border border-primary/30 bg-white text-primary shadow-2xl shadow-primary/20 ${dispatchingZone ? 'dispatch-robot-live' : ''}`}
           >
             {dispatchingZone && <span className="absolute h-32 w-32 rounded-full border-2 border-primary/40" />}
             <span className="absolute -right-2 -top-2 rounded-full bg-primary px-2 py-1 text-[10px] font-black text-white">S-01</span>
             <div className="relative grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
               <Bot size={34} />
               <span className="absolute left-3 top-5 h-1.5 w-1.5 rounded-full bg-primary" />
               <span className="absolute right-3 top-5 h-1.5 w-1.5 rounded-full bg-primary" />
             </div>
             <span className="mt-2 text-[10px] font-black text-slate-700">{dispatchingZone ? dispatchStage : '待命'}</span>
           </motion.div>

           {/* Zones */}
           <motion.button
             initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }}
             onClick={() => !dispatchingZone && setSelectedZone('A')}
             className={`absolute top-[15%] left-[12%] w-[140px] h-[120px] rounded-4xl flex flex-col items-center justify-center border-2 transition-all z-10 backdrop-blur-md
              ${dispatchingZone === 'A' ? 'bg-cyan-50 border-primary shadow-xl shadow-primary/20 scale-110 ring-2 ring-primary ring-offset-2' : selectedZone === 'A' ? 'bg-cyan-50 border-primary shadow-lg shadow-primary/10 scale-110 ring-2 ring-primary ring-offset-2 active:scale-100' : 'bg-white border-slate-200 hover:bg-cyan-50 active:scale-95'}`}
           >
              <span className="text-[10px] font-extrabold text-primary mb-1 opacity-80">一般引導</span>
              <p className="font-bold text-2xl tracking-tight text-slate-950">區域 A</p>
              <p className="mt-1 text-[11px] font-black text-slate-500">行政走廊</p>
              <div className="w-8 h-1 bg-white/20 mt-3 rounded-full overflow-hidden">
                 <motion.div animate={{ x: [-32, 32] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-full h-full bg-primary"></motion.div>
              </div>
           </motion.button>

           <motion.button
             initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}
             onClick={() => !dispatchingZone && setSelectedZone('B')}
             className={`absolute top-[45%] right-[8%] w-[130px] h-[140px] rounded-4xl flex flex-col items-center justify-center border-2 transition-all z-10 backdrop-blur-md
              ${dispatchingZone === 'B' ? 'bg-amber-50 border-amber-400 shadow-xl shadow-amber-200 scale-110 ring-2 ring-amber-400 ring-offset-2' : selectedZone === 'B' ? 'bg-amber-50 border-amber-400 shadow-lg shadow-amber-100 scale-110 ring-2 ring-amber-400 ring-offset-2 active:scale-100' : 'bg-white border-slate-200 hover:bg-amber-50 active:scale-95'}`}
           >
              <span className="text-[10px] font-extrabold text-amber-600 mb-1 opacity-80">人流偏高</span>
              <p className="font-bold text-2xl tracking-tight text-slate-950">區域 B</p>
              <p className="mt-1 text-[11px] font-black text-slate-500">中庭熱區</p>
              <div className="mt-4 px-2 py-1 bg-error/20 border border-error/30 rounded-lg animate-pulse flex items-center gap-1.5">
                 <Users size={12} className="text-error" />
                 <span className="text-[9px] font-extrabold text-error">熱區警示</span>
              </div>
           </motion.button>

           <motion.button
             initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3 }}
             onClick={() => !dispatchingZone && setSelectedZone('C')}
             className={`absolute bottom-[10%] left-[18%] w-[170px] h-[100px] rounded-4xl flex flex-col items-center justify-center border-2 transition-all z-10 backdrop-blur-md
              ${dispatchingZone === 'C' ? 'bg-emerald-50 border-emerald-400 shadow-xl shadow-emerald-100 scale-110 ring-2 ring-emerald-400 ring-offset-2' : selectedZone === 'C' ? 'bg-emerald-50 border-emerald-400 shadow-lg shadow-emerald-100 scale-110 ring-2 ring-emerald-400 ring-offset-2 active:scale-100' : 'bg-white border-slate-200 hover:bg-emerald-50 active:scale-95'}`}
           >
              <span className="text-[10px] font-extrabold text-emerald-600 mb-1 opacity-80">安靜巡查</span>
              <p className="font-bold text-2xl tracking-tight text-slate-950">區域 C</p>
              <p className="mt-1 text-[11px] font-black text-slate-500">圖書角</p>
              <p className="text-[9px] font-bold text-slate-400 mt-2">待命 · 穩定</p>
           </motion.button>
        </div>

        {/* Task Control */}
        <div className="min-h-[220px]">
          <AnimatePresence mode="wait">
            {selectedZone === 'none' ? (
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col items-center justify-center py-10 bg-white rounded-4xl border border-dashed border-slate-200 shadow-sm">
                  <div className="w-16 h-16 bg-cyan-50 rounded-full flex items-center justify-center mb-4 text-primary"><Navigation size={32} /></div>
                  <p className="text-sm font-bold text-slate-500">點地圖選區域</p>
               </motion.div>
            ) : (
              <motion.div
                key={selectedZone}
                initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }}
                className="bg-white p-6 rounded-4xl border border-slate-200 shadow-xl shadow-slate-200/80 relative overflow-hidden"
              >
                 <div className="flex justify-between items-start mb-8 relative z-10">
                    <div>
                       <span className="text-xs font-extrabold text-primary mb-2 block">任務目標</span>
                       <h3 className="text-4xl font-bold tracking-tight">
                         區域 <span className="text-primary">{selectedZone}</span>
                       </h3>
                       {activeZone && <p className="mt-2 text-sm font-bold text-slate-500">{activeZone.name} · {activeZone.signal} · {activeZone.risk}</p>}
                    </div>
                    <button disabled={Boolean(dispatchingZone)} onClick={() => setSelectedZone('none')} className="text-xs font-bold text-slate-500 hover:text-slate-900 bg-slate-50 px-4 py-2 rounded-xl transition-colors disabled:opacity-40">取消</button>
                 </div>

                 {activeZone && (
                   <div className="mb-5 grid grid-cols-2 gap-3">
                     <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                       <p className="text-xs font-black text-slate-500">現場訊號</p>
                       <p className="mt-1 font-black text-slate-950">{activeZone.metric}</p>
                     </div>
                     <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                       <p className="text-xs font-black text-slate-500">建議動作</p>
                       <p className="mt-1 font-black text-slate-950">{activeZone.action}</p>
                     </div>
                   </div>
                 )}

                 <div className="grid grid-cols-2 gap-3 mb-6 relative z-10">
                   <button
                      disabled={Boolean(dispatchingZone)}
                      onClick={() => !dispatchingZone && setTaskType('patrol')}
                      className={`p-5 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${taskType === 'patrol' ? 'bg-primary/10 border-primary text-primary shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-white'}`}
                   >
                      <motion.div animate={taskType === 'patrol' ? { scale: [1, 1.1, 1] } : {}} transition={{ repeat: Infinity, duration: 2 }}><Navigation size={32} /></motion.div>
                      <span className="text-xs font-extrabold">自動巡邏</span>
                   </button>
                   <button
                      disabled={Boolean(dispatchingZone)}
                      onClick={() => !dispatchingZone && setTaskType('broadcast')}
                      className={`p-5 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${taskType === 'broadcast' ? 'bg-tertiary/10 border-tertiary text-tertiary shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-white'}`}
                   >
                      <motion.div animate={taskType === 'broadcast' ? { rotate: [0, 10, -10, 0] } : {}} transition={{ repeat: Infinity, duration: 2 }}><ShieldAlert size={32} /></motion.div>
                      <span className="text-xs font-extrabold">群眾疏導</span>
                   </button>
                 </div>

                 {recommendation && (
                   <div className="mb-5">
                     <p className={`rounded-2xl border p-4 text-sm font-bold leading-relaxed ${recommendationError ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-primary/20 bg-primary/10 text-primary'}`}>
                       {recommendation}
                     </p>
                     {recommendationError && (
                       <button onClick={handleDispatch} disabled={Boolean(dispatchingZone)} className="mt-2 w-full rounded-2xl border border-primary/20 bg-primary/5 py-2 text-xs font-black text-primary transition hover:bg-primary/10 disabled:opacity-40">
                         重新取得 AI 建議
                       </button>
                     )}
                   </div>
                 )}

                 <div className="mb-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black text-slate-500">
                   <span>任務模式</span>
                   <span className={taskType === 'broadcast' ? 'text-tertiary' : 'text-primary'}>{taskType === 'broadcast' ? '群眾疏導' : '自動巡邏'}</span>
                 </div>

                 {dispatchingZone && (
                   <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-5 grid grid-cols-3 gap-2">
                     {DISPATCH_STAGES.map((step, index) => (
                       <div key={step} className={`rounded-2xl border px-3 py-2 text-center text-[10px] font-black ${index <= (dispatchStage === '確認區域' ? 0 : dispatchStage === '機器人出勤' ? 1 : 2) ? 'border-primary/30 bg-primary/10 text-primary' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                         {step}
                       </div>
                     ))}
                   </motion.div>
                 )}

                 {dispatchingZone && (
                   <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                     <div className="flex items-center justify-between text-[11px] font-black text-slate-500">
                       <span>{missionId || '建立任務中'}</span>
                       <span>{activeZone?.name ?? `區域 ${selectedZone}`}</span>
                     </div>
                     <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                       <motion.div animate={{ width: `${dispatchProgress}%` }} className="h-full rounded-full bg-primary" />
                     </div>
                     <p className="mt-3 text-xs font-bold text-slate-600">
                       {dispatchStage === '確認區域' ? '確認路線與任務類型' : dispatchStage === '機器人出勤' ? 'S-01 正沿校園路線移動' : '任務已同步到中控與紀錄'}
                     </p>
                   </motion.div>
                 )}

                 {dispatchComplete && (
                   <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mb-5 flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 p-4 text-primary">
                     <CheckCircle2 size={24} />
                     <div>
                       <p className="text-sm font-black">任務已建立</p>
                       <p className="text-xs font-bold opacity-80">主畫面機器人狀態與日誌已同步更新</p>
                     </div>
                   </motion.div>
                 )}

                 <button
                   onClick={handleDispatch}
                   disabled={Boolean(dispatchingZone)}
                   className="w-full min-h-16 rounded-2xl bg-primary px-4 py-5 text-base font-bold text-white shadow-lg shadow-primary/25 transition-all active:scale-[0.985] disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none flex items-center justify-center gap-4 group/btn relative overflow-hidden"
                 >
                   <div className="absolute inset-0 bg-white/10 -translate-x-full group-hover/btn:translate-x-0 transition-transform duration-500"></div>
                   <Zap size={24} className="group-hover/btn:scale-125 transition-transform" />
                   <span className="relative z-10">{dispatchingZone ? dispatchStage : '派遣服務機器人'}</span>
                 </button>

                 {dispatchComplete && (
                   <button
                     onClick={goBack}
                     className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-black text-slate-700 transition hover:bg-white active:scale-[0.985]"
                   >
                     回任務中控
                   </button>
                 )}
                 {dispatchComplete && (
                   <button
                     onClick={resetDispatch}
                     className="mt-3 w-full rounded-2xl bg-slate-950 px-4 py-4 text-sm font-black text-white transition hover:bg-slate-800 active:scale-[0.985]"
                   >
                     再派一個區域
                   </button>
                 )}

                 <div className="mt-5 space-y-2">
                   {missionLog.slice(0, 3).map((item) => (
                     <div key={item} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                       <MapPin className="h-3.5 w-3.5 text-primary" />
                       {item}
                     </div>
                   ))}
                 </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </main>
    </div>
  );
}
