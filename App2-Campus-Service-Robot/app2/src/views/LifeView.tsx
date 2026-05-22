import {useEffect, useRef, useState} from 'react';
import {motion} from 'motion/react';
import {BottomSheet} from '../components/ui';
import {AlertOctagon, Calendar, CheckCircle2, ChevronRight, CloudRain, Footprints, Megaphone, Route, Terminal} from 'lucide-react';
import {useAppActions, useAppState} from '../state/AppStateProvider';
import type {DispatchTaskType, Schedule} from '../state/appState';
import {BellScheduleCard} from '../components/life/BellScheduleCard';
import {EnvMonitorCard} from '../components/life/EnvMonitorCard';
import {ScanMapCard} from '../components/life/ScanMapCard';
import {BroadcastCard} from '../components/life/BroadcastCard';

export function LifeView({
  showToast,
  navigateTo,
}: {
  showToast: (msg: string) => void;
  navigateTo: (id: string, props?: Record<string, unknown>) => void;
}) {
  const state = useAppState();
  const actions = useAppActions();

  const [modal, setModal] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editArea, setEditArea] = useState('');

  const isEmergency = state.campusStatus.isEmergency;
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (modal === 'logs' && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({behavior: 'smooth'});
    }
  }, [state.logs, modal]);

  const handleOpenSchedule = (id: string, time: string, area: string) => {
    setEditingSchedule(id);
    setEditTime(time);
    setEditArea(area);
    setModal('schedule');
  };

  const handleSaveSchedule = () => {
    if (!editTime.trim() || !editArea.trim()) {
      showToast('時間和區域不能為空');
      return;
    }
    actions.saveSchedule({id: editingSchedule, time: editTime.trim(), area: editArea.trim()});
    showToast('任務排程設定已更新');
    setModal(null);
  };

  const runRainDismissalDemo = () => {
    const message = '放學時段可能降雨，請同學收好雨具、走廊與樓梯放慢腳步，校門口依序通行。';
    actions.setRemindWarning(true);
    actions.saveSchedule({id: 'schedule2', time: '14:20', area: '全校廣播節點與校門口'});
    actions.addDispatchTask({zone: '校門口與 B 棟走廊', taskType: 'broadcast', message});
    showToast('已建立放學降雨提醒，廣播與任務紀錄已同步');
  };

  const runCorridorSlowDemo = () => {
    const message = 'B 棟走廊偵測到移動速度偏快，請同學停止奔跑、靠右慢行，避免滑倒與碰撞。';
    actions.addDispatchTask({zone: 'B 棟走廊', taskType: 'broadcast', message});
    showToast('已發送走廊慢行提醒，服務機器人狀態已同步');
  };

  const runDismissalPatrolDemo = () => {
    actions.saveSchedule({id: 'schedule1', time: '14:25', area: '校門口、操場入口、B 棟走廊'});
    actions.addDispatchTask({zone: '校門口、操場入口、B 棟走廊', taskType: 'patrol'});
    showToast('已啟動放學巡查路線，排程與派遣紀錄已建立');
  };

  const handleSafetyBroadcast = ({zone, message}: {zone: string; message: string}) => {
    actions.addDispatchTask({zone, taskType: 'broadcast', message});
    showToast(`${zone} 慢行提醒已送出`);
  };

  const handleRunSchedule = (schedule: Schedule) => {
    if (schedule.kind === 'broadcast') {
      actions.addDispatchTask({
        zone: schedule.area,
        taskType: 'broadcast',
        message: `${schedule.title}：請同學留意校園提醒，依序通行並注意安全。`,
      });
      showToast(`${schedule.title} 已送出廣播任務`);
      return;
    }
    actions.addDispatchTask({zone: schedule.area, taskType: 'patrol'});
    showToast(`${schedule.title} 已啟動巡查任務`);
  };

  const demoActions = [
    {
      id: 'rain',
      icon: CloudRain,
      title: '放學降雨預警',
      detail: '模擬放學前降雨，提前廣播慢行並安排校門巡查。',
      metric: '14:20',
      action: runRainDismissalDemo,
    },
    {
      id: 'speed',
      icon: Footprints,
      title: '走廊奔跑提醒',
      detail: '人流影片偵測到移動偏快時，直接發送慢行廣播。',
      metric: 'B 棟',
      action: runCorridorSlowDemo,
    },
    {
      id: 'route',
      icon: Route,
      title: '放學巡查路線',
      detail: '把校門、操場入口與走廊排成一次巡查任務。',
      metric: 'R-01',
      action: runDismissalPatrolDemo,
    },
  ] as const;

  return (
    <div className="space-y-4 pb-10">
      <div className={`rounded-2xl px-5 py-3.5 flex items-center justify-between border transition-all duration-500 ${isEmergency ? 'bg-error text-white border-error shadow-lg shadow-error/30' : 'bg-surface-container-low border-outline-variant/30'}`}>
        <div className="flex items-center gap-3">
          <AlertOctagon size={18} className={isEmergency ? 'text-white animate-pulse' : 'text-error'} />
          <div>
            <p className={`text-[10px] font-black tracking-widest uppercase font-mono ${isEmergency ? 'text-white/70' : 'text-on-surface-variant/50'}`}>全校安全應變</p>
            <p className={`text-sm font-bold leading-none mt-0.5 ${isEmergency ? 'text-white' : 'text-on-surface'}`}>
              {isEmergency ? '[CRITICAL] 全校進入封控模式' : '系統待命 · 正常狀態'}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            actions.setEmergency(!isEmergency);
            showToast(isEmergency ? '已解除緊急狀態，系統恢復正常' : '【警告】全校進入緊急安全封控模式！');
          }}
          className={`shrink-0 relative w-14 h-7 rounded-full transition-all duration-500 border-2 ${isEmergency ? 'bg-white border-white' : 'bg-surface-container-high border-outline-variant/30'}`}
        >
          <motion.div
            animate={{x: isEmergency ? 28 : 2}}
            transition={{type: 'spring', stiffness: 400, damping: 25}}
            className={`absolute top-0.5 w-5 h-5 rounded-full shadow-lg ${isEmergency ? 'bg-error' : 'bg-white'}`}
          />
        </button>
      </div>

      <EnvMonitorCard onRainPlan={runRainDismissalDemo} />

      <section className="grid grid-cols-1 gap-3 px-1 lg:grid-cols-3">
        {demoActions.map((item) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={item.id}
              data-e2e={`life-demo-${item.id}`}
              type="button"
              whileHover={{y: -2}}
              whileTap={{scale: 0.98}}
              onClick={item.action}
              className="group min-h-30 rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-4 text-left shadow-sm transition hover:border-primary/35 hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-white">
                  <Icon size={18} />
                </div>
                <span className="rounded-full bg-surface-container-low px-2.5 py-1 text-[10px] font-black text-primary">{item.metric}</span>
              </div>
              <h3 className="font-headline text-sm font-black text-on-surface">{item.title}</h3>
              <p className="mt-1 text-xs font-bold leading-relaxed text-on-surface-variant">{item.detail}</p>
              <div className="mt-3 flex items-center gap-1.5 text-[10px] font-black tracking-widest text-primary">
                <CheckCircle2 size={12} />
                可直接演示
              </div>
            </motion.button>
          );
        })}
      </section>

      <section className="px-1">
        <ScanMapCard active onSafetyBroadcast={handleSafetyBroadcast} />
      </section>

      <section data-tour="life-services" className="grid grid-cols-1 md:grid-cols-2 gap-4 px-1">
        <BellScheduleCard />
        <BroadcastCard
          showToast={showToast}
          onDispatch={({zones, message}) => actions.addDispatchTask({zone: zones, taskType: 'broadcast' as DispatchTaskType, message})}
        />
      </section>

      <section className="px-1">
        <div className="bg-surface-container-low rounded-2xl p-5 border border-outline-variant/30 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-headline text-sm font-bold">生活任務排程</h3>
            <button onClick={() => navigateTo('task-schedule')} className="flex items-center gap-1 text-[10px] text-primary font-bold hover:underline">
              編輯排程 <ChevronRight size={11} />
            </button>
          </div>
          <div className="space-y-2">
            {state.schedules.slice(0, 3).map(schedule => (
              <motion.div
                key={schedule.id}
                whileHover={{x: 2}}
                whileTap={{scale: 0.985}}
                onClick={() => handleOpenSchedule(schedule.id, schedule.time, schedule.area)}
                className="flex items-center gap-3 p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/20 hover:border-primary/30 cursor-pointer transition-all"
              >
                <Calendar size={15} className="text-on-surface-variant shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{schedule.title}</p>
                  <p className="text-[10px] text-on-surface-variant font-mono opacity-60 truncate">{schedule.area}</p>
                </div>
                <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg shrink-0">{schedule.time}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRunSchedule(schedule);
                  }}
                  className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 text-[10px] font-black text-white transition active:scale-95"
                >
                  {schedule.kind === 'broadcast' ? <Megaphone size={11} /> : <Route size={11} />}
                  立即執行
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <div className="px-1 flex justify-end">
        <button
          onClick={() => setModal('logs')}
          className="flex items-center gap-1.5 text-[10px] text-on-surface-variant/40 hover:text-primary transition-colors font-mono font-bold"
        >
          <Terminal size={12} />
          系統日誌
        </button>
      </div>

      <BottomSheet isOpen={modal === 'logs'} onClose={() => setModal(null)} title="系統紀錄">
        <div className="p-6 bg-[#0c121d] rounded-[2.5rem] mx-4 mb-10 mt-2 font-mono text-[11px] text-[#a9b1d6] leading-relaxed h-[50vh] overflow-y-auto custom-scrollbar shadow-2xl border-4 border-surface-container-low">
          <div className="flex items-center justify-between mb-6 sticky top-0 bg-[#0c121d]/90 backdrop-blur-xl pb-3 z-10 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
                <Terminal size={16} />
              </div>
              <span className="text-white font-extrabold tracking-widest text-[10px]">派遣與硬體紀錄</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-[#87d46c]/10 rounded-full border border-[#87d46c]/20">
              <div className="w-1.5 h-1.5 bg-[#87d46c] rounded-full animate-pulse" />
              <span className="text-[9px] text-[#87d46c] font-extrabold tracking-[0.2em]">即時更新</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] text-primary/40 font-bold mb-4 italic px-2">本次操作紀錄</div>
            {state.logs.map(log => (
              <motion.div
                initial={{opacity: 0, x: -10}}
                animate={{opacity: 1, x: 0}}
                key={log.id}
                className={`flex gap-3 p-2 rounded-lg hover:bg-white/5 ${log.type === 'warn' ? 'text-tertiary' : log.type === 'error' ? 'text-error' : 'text-[#a9b1d6]'}`}
              >
                <span className="opacity-30 font-bold shrink-0">{log.time}</span>
                <span className="flex-1">{log.message}</span>
              </motion.div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={modal === 'schedule'} onClose={() => setModal(null)} title="編輯預約任務">
        <div className="p-4 space-y-8 pb-8">
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">任務時間</label>
            <input
              type="time"
              value={editTime}
              onChange={e => setEditTime(e.target.value)}
              className="w-full bg-surface-container-lowest shadow-sm border border-outline-variant/20 rounded-2xl px-5 py-4 text-xl font-headline font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">覆蓋區域設定</label>
            <div className="relative">
              <select
                value={editArea}
                onChange={e => setEditArea(e.target.value)}
                className="w-full bg-surface-container-lowest shadow-sm border border-outline-variant/20 rounded-2xl px-5 py-4 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
              >
                <option value="所有走廊與公共區">所有走廊與公共區</option>
                <option value="僅 A 棟教學樓">僅 A 棟教學樓</option>
                <option value="B 棟活動中心與操場">B 棟活動中心與操場</option>
              </select>
              <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">▼</div>
            </div>
          </div>
          <button
            onClick={handleSaveSchedule}
            className="w-full bg-primary hover:bg-primary/95 text-white font-bold py-4 rounded-2xl active:scale-95 shadow-lg shadow-primary/20 transition-all text-lg"
          >
            儲存變更
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
