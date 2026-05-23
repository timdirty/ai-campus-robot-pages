import type {AppState} from '../state/appState';

export type DemoStep = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
};

export type DemoHealthStatus = {
  label: string;
  value: string;
  ok: boolean;
};

export function getDemoSteps(state: AppState): DemoStep[] {
  const hasDelivery = state.orders.length > 0;
  const hasCompletedDelivery = state.orders.some((order) => order.status === 'delivered');
  const hasTeachingAction = state.attendance.scanned || Object.values(state.studentReports).some((report) => report.events.length > 1);
  const hasDispatch = state.tasks.some((task) => task.source === 'dispatch');
  const hasReportReady = state.logs.length > 0 && state.robotCommandLogs.length > 1;

  return [
    {id: 'delivery', label: '建立配送任務', detail: '選擇物品與目的地，讓 R-01 接手取送任務。', done: hasDelivery},
    {id: 'tracking', label: '完成配送簽收', detail: '追蹤路線、到點提醒與取件確認都回到紀錄。', done: hasCompletedDelivery},
    {id: 'teaching', label: '教學 AI 輔助', detail: '點名辨識、注意力判讀與師生回覆形成可展示證據。', done: hasTeachingAction},
    {id: 'dispatch', label: '生活安全巡查', detail: '天氣、走廊速度、人流壅塞會觸發廣播與機器人任務。', done: hasDispatch},
    {id: 'report', label: '紀錄與回報', detail: '指令、AI 建議、ROBOT 顯示同步都留下可回看紀錄。', done: hasReportReady},
  ];
}

export function getDemoHealth(state: AppState): DemoHealthStatus[] {
  return [
    {label: '任務資料', value: `${state.tasks.length} 任務 / ${state.logs.length} 紀錄`, ok: state.tasks.length > 0},
    {label: 'ROBOT 指令', value: `${state.robotCommandLogs.length} 筆同步`, ok: state.robotCommandLogs.length > 0},
    {label: '機器人狀態', value: `${state.robots.filter((robot) => robot.isRunning).length} 台執行中`, ok: state.robots.length >= 1},
    {label: '硬體模式', value: state.hardwareMode === 'serial-ready' ? '已接實體硬體' : '離線展示可用', ok: true},
  ];
}
