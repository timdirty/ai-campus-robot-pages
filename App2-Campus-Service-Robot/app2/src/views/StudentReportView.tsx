import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, User, BarChart3, Clock, AlertTriangle, Lightbulb, CheckCircle2 } from 'lucide-react';
import { useAppState } from '../state/AppStateProvider';
import { openPrintableReport } from '../services/reports';
import type { StudentReport } from '../state/appState';

export function StudentReportView({ goBack, showToast, name = "學習訊號 A", studentId }: {goBack: () => void; showToast: (msg: string) => void; name?: string; studentId?: string}) {
  const state = useAppState();
  const [reportLoading, setReportLoading] = React.useState(false);
  const report = useMemo(
    () =>
      (studentId ? state.studentReports[studentId] : undefined) ??
      (Object.values(state.studentReports) as StudentReport[]).find((item) => item.name === name) ??
      state.studentReports['05'],
    [state.studentReports, studentId, name],
  );
  const displayName = report?.name ?? name;

  const handleSendReport = async () => {
    if (reportLoading) return;
    setReportLoading(true);
    try {
      await openPrintableReport({
        state,
        kind: 'student',
        title: `${displayName} 學習狀態報告`,
        studentId: report?.studentId,
      });
      showToast('已開啟可列印狀態報告');
      goBack();
    } catch {
      showToast('報告產生失敗，請稍後再試');
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-outline-variant/20 px-4 py-4 flex items-center justify-between">
        <button aria-label="返回" onClick={goBack} className="p-2 rounded-full bg-surface-container-low active:scale-95 transition-transform text-on-surface">
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-headline font-bold text-xl absolute left-1/2 -translate-x-1/2">學習狀態報告</h1>
        <div className="w-10"></div>
      </header>

      <main className="p-6 space-y-6">
        <div className="flex items-center gap-5 bg-surface-container-low p-6 rounded-4xl border border-outline-variant/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
          <div className="w-16 h-16 rounded-3xl bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0 shadow-inner">
             <User size={32} />
          </div>
          <div className="relative z-10">
             <div className="flex items-center gap-2 mb-1">
                <h2 className="font-headline font-bold text-2xl">{displayName}</h2>
                <span className="bg-[#87d46c]/20 text-[#87d46c] text-[10px] font-mono px-2 py-0.5 rounded font-bold tracking-widest border border-[#87d46c]/30">即時</span>
             </div>
             <p className="text-sm font-medium text-on-surface-variant">2026 春季學期 · 綜合評估</p>
          </div>
        </div>

        <section className="grid grid-cols-2 gap-5">
           <div className="bg-surface-container-lowest border border-outline-variant/30 p-6 rounded-[1.75rem] shadow-sm flex flex-col justify-between h-36">
             <div className="flex items-center justify-between">
               <span className="text-xs text-on-surface-variant font-bold tracking-widest">專注度</span>
               <BarChart3 className="text-primary" size={24} />
             </div>
             <p className="text-5xl font-headline font-bold text-primary tracking-tighter">{report?.averageFocus ?? 78}<span className="text-xl text-on-surface-variant ml-1 font-sans">%</span></p>
           </div>
           <div className="bg-surface-container-lowest border border-outline-variant/30 p-6 rounded-[1.75rem] shadow-sm flex flex-col justify-between h-36">
             <div className="flex items-center justify-between">
               <span className="text-xs text-on-surface-variant font-bold tracking-widest">分心次數</span>
               <AlertTriangle className="text-tertiary" size={24} />
             </div>
             <p className="text-5xl font-headline font-bold font-mono tracking-tighter text-on-surface">{report?.distractRate ?? 3.2}<span className="text-sm text-on-surface-variant ml-1.5 font-sans font-bold tracking-wider">次/時</span></p>
           </div>
        </section>

        <section>
          <h3 className="font-bold text-on-surface-variant text-sm px-2 mb-4 tracking-widest font-mono">AI 學習狀態分析</h3>
          <div className="bg-surface-container-low p-7 rounded-4xl border border-outline-variant/30 shadow-sm space-y-7 relative overflow-hidden">

             <div className="flex gap-5 relative z-10">
                <div className="w-12 h-12 rounded-[1.25rem] bg-primary/10 flex items-center justify-center shrink-0">
                  <Lightbulb size={24} className="text-primary" />
                </div>
                <div>
                  <h4 className="font-bold text-lg mb-1.5 tracking-wide">{report?.learningStyle ?? '視覺型學習者'}</h4>
                  <p className="text-[15px] text-on-surface-variant leading-relaxed">課堂回饋顯示，圖表與實體演示時段的互動度最高。建議下一段課程優先使用視覺化教材。</p>
                </div>
             </div>

             <div className="flex gap-5 relative z-10">
                <div className="w-12 h-12 rounded-[1.25rem] bg-tertiary/10 flex items-center justify-center shrink-0">
                  <Clock size={24} className="text-tertiary" />
                </div>
                <div>
                   <h4 className="font-bold text-lg mb-1.5 tracking-wide">能量衰退期</h4>
                   <p className="text-[15px] text-on-surface-variant leading-relaxed">課程進行 25 分鐘後，回應速度與互動頻率下降。建議在課程中段安排簡短問答，讓注意力自然回到任務。</p>
                </div>
             </div>

             <div className="relative z-10 rounded-[1.5rem] bg-surface-container-lowest p-5 border border-outline-variant/20">
                <h4 className="font-bold text-lg mb-3 tracking-wide">近期處理紀錄</h4>
                <div className="space-y-2">
                  {(report?.events ?? ['尚無事件紀錄']).slice(0, 4).map((event, index) => (
                    <p key={index} className="text-[13px] font-medium leading-relaxed text-on-surface-variant">
                      {event}
                    </p>
                  ))}
                </div>
             </div>
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-50 p-5 bg-background/95 backdrop-blur-3xl border-t border-outline-variant/30 pb-safe pb-6">
         <button onClick={handleSendReport} disabled={reportLoading} className={`w-full max-w-md mx-auto flex items-center justify-center gap-3 font-bold text-[17px] py-5 rounded-3xl transition-all shadow-md ${reportLoading ? 'bg-surface-container-low text-on-surface-variant' : 'bg-secondary-container text-on-secondary-container active:scale-[0.98]'}`}>
            {reportLoading ? (
              <>
                <span className="w-5 h-5 border-2 border-on-surface-variant/30 border-t-on-surface-variant rounded-full animate-spin" />
                產生報告中…
              </>
            ) : (
              <>
                <CheckCircle2 size={24} />
                開啟可列印分析報告
              </>
            )}
         </button>
      </div>
    </div>
  );
}
