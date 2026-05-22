export const STORAGE_KEY = 'campus-service-robot:v1';

export type RobotStatus = '待命' | '充電' | '導診' | '清掃' | '配送' | '巡邏' | '疏導';
export type OrderStatus = 'in_transit' | 'delivered';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type TaskSource = 'delivery' | 'schedule' | 'dispatch' | 'teaching' | 'life';
export type TeachingSignalType = 'question' | 'alert';
export type DispatchTaskType = 'patrol' | 'broadcast';
export type HardwareMode = 'demo' | 'serial-ready';
export type RobotCommandStatus = 'demo-only' | 'queued' | 'sent' | 'simulated' | 'failed';

export interface Robot {
  id: string;
  serial: string;
  status: RobotStatus;
  position: string;
  battery: number;
  task: string;
  eta: string;
  phase: string;
  isRunning: boolean;
  speed: number;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  desc: string;
  img: string;
  category: 'snacks' | 'stationery' | 'drinks';
  stock: number;
}

export interface Order {
  id: string;
  productId: number;
  productName: string;
  quantity: number;
  destination: string;
  status: OrderStatus;
  robotId: string;
  createdAt: string;
  deliveredAt?: string;
}

export interface CampusTask {
  id: string;
  title: string;
  area: string;
  status: TaskStatus;
  source: TaskSource;
  robotId?: string;
  createdAt: string;
  completedAt?: string;
  detail?: string;
}

export interface Schedule {
  id: string;
  title: string;
  time: string;
  area: string;
  kind: 'cleaning' | 'broadcast';
}

export interface TeachingSignal {
  id: string;
  type: TeachingSignalType;
  name: string;
  studentId: string;
  message: string;
  createdAt: string;
  visual?: {
    imageDataUrl: string;
    markerLabel: string;
    markerBoxes: Array<{x: number; y: number; width: number; height: number}>;
  };
}

export interface StudentReport {
  studentId: string;
  name: string;
  averageFocus: number;
  distractRate: number;
  learningStyle: string;
  events: string[];
}

export interface AttendanceState {
  scanned: boolean;
  present: number;
  absent: number;
  total: number;
  absentNames: string[];
}

export interface SensorsState {
  temp: number;
  hum: number;
  aqi: number;
}

export interface SettingsState {
  notifications: boolean;
  remindWarning: boolean;
  demoMode: boolean;
  expectedAttendanceTotal: number;
}

export interface CampusStatus {
  isEmergency: boolean;
  safetyMode: 'normal' | 'lockdown';
  activeZone?: string;
}

export interface SystemLog {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'warn' | 'error';
}

export interface RobotCommandLog {
  id: string;
  time: string;
  command: string;
  label: string;
  target: string;
  source: TaskSource | 'system';
  mode: HardwareMode;
  status: RobotCommandStatus;
  note: string;
}

export interface AppState {
  robots: Robot[];
  products: Product[];
  orders: Order[];
  tasks: CampusTask[];
  schedules: Schedule[];
  teachingSignals: TeachingSignal[];
  studentReports: Record<string, StudentReport>;
  attendance: AttendanceState;
  sensors: SensorsState;
  settings: SettingsState;
  campusStatus: CampusStatus;
  hardwareMode: HardwareMode;
  robotCommandLogs: RobotCommandLog[];
  logs: SystemLog[];
  lastUpdated: string;
}

type CreateDeliveryOrderPayload = {
  productId: number;
  quantity: number;
  destination: string;
};

type SaveSchedulePayload = {
  id: string;
  time: string;
  area: string;
};

type ResolveTeachingSignalPayload = {
  signalId: string;
  action: string;
};

type AddTeachingSignalPayload = {
  id?: string;
  type: TeachingSignalType;
  name: string;
  studentId: string;
  message: string;
  visual?: TeachingSignal['visual'];
};

type RecordTeachingScanTaskPayload = {
  id?: string;
  title?: string;
  detail?: string;
};

export type AppAction =
  | { type: 'CREATE_DELIVERY_ORDER'; payload: CreateDeliveryOrderPayload; now?: string }
  | { type: 'COMPLETE_ORDER'; payload: { orderId: string }; now?: string }
  | { type: 'SAVE_SCHEDULE'; payload: SaveSchedulePayload; now?: string }
  | { type: 'SET_ATTENDANCE_SCANNED'; now?: string }
  | { type: 'RECORD_TEACHING_SCAN_TASK'; payload?: RecordTeachingScanTaskPayload; now?: string }
  | { type: 'COMPLETE_TEACHING_SCAN_TASK'; payload: { id: string; detail?: string }; now?: string }
  | { type: 'ADD_TEACHING_SIGNAL'; payload: AddTeachingSignalPayload; now?: string }
  | { type: 'CLEAR_TEACHING_SIGNALS'; now?: string }
  | { type: 'RESOLVE_TEACHING_SIGNAL'; payload: ResolveTeachingSignalPayload; now?: string }
  | { type: 'ADD_TEACHER_REPLY'; payload: { signalId: string; reply: string }; now?: string }
  | { type: 'SET_EMERGENCY'; payload: { enabled: boolean }; now?: string }
  | { type: 'SET_NOTIFICATIONS'; payload: { enabled: boolean }; now?: string }
  | { type: 'SET_REMIND_WARNING'; payload: { enabled: boolean }; now?: string }
  | { type: 'SET_EXPECTED_ATTENDANCE_TOTAL'; payload: { total: number }; now?: string }
  | { type: 'SET_DEMO_MODE'; payload: { enabled: boolean }; now?: string }
  | { type: 'ADD_DISPATCH_TASK'; payload: { zone: string; taskType: DispatchTaskType; message?: string }; now?: string }
  | { type: 'COMPLETE_DISPATCH_TASK'; payload: { zone: string; taskType: DispatchTaskType }; now?: string }
  | { type: 'SET_ROBOT_MODE'; payload: { robotId: string; status: RobotStatus }; now?: string }
  | { type: 'SET_ROBOT_RUNNING'; payload: { robotId: string; running: boolean }; now?: string }
  | { type: 'SET_ROBOT_SPEED'; payload: { robotId: string; speed: number }; now?: string }
  | { type: 'TICK_SENSORS'; payload: SensorsState; now?: string }
  | { type: 'CLEAR_LOCAL_CACHE'; now?: string }
  | { type: 'MARK_HARDWARE_COMMAND'; payload: { id: string; ok: boolean; message: string; simulated?: boolean }; now?: string }
  | { type: 'RESTORE_DEMO_STATE'; payload: { state: AppState }; now?: string }
  | { type: 'AUTO_COMPLETE_IN_TRANSIT'; now?: string }
  | { type: 'RESET_DEMO'; now?: string };

const svgUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

function compactSignalText(input: string) {
  return input.toLowerCase().replace(/[\s，。！？、,.!?：:；;「」『』（）()[\]-]/g, '');
}

function teachingSignalDedupKey(type: TeachingSignalType, name: string, message: string) {
  const text = compactSignalText(`${name} ${message}`);
  if (type === 'question') return `question:${compactSignalText(name)}:${compactSignalText(message).slice(0, 36)}`;
  if (text.includes('手機') || text.includes('電子裝置') || text.includes('phone') || text.includes('mobile')) return 'alert:device';
  if (text.includes('睡') || text.includes('趴') || text.includes('低頭') || text.includes('tired') || text.includes('sleep')) return 'alert:tired';
  if (text.includes('舉手') || text.includes('求助') || text.includes('raise') || text.includes('hand')) return 'alert:help';
  if (text.includes('分心') || text.includes('躁動') || text.includes('專注') || text.includes('restless')) return 'alert:focus';
  return `alert:${text.slice(0, 42)}`;
}

const productImages = {
  toast: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#FEF3C7"/><rect x="35" y="50" width="130" height="110" rx="22" fill="#D97706"/><rect x="45" y="60" width="110" height="90" rx="16" fill="#FCD34D"/><rect x="62" y="90" width="76" height="10" rx="5" fill="#D97706" opacity="0.5"/><rect x="62" y="110" width="56" height="10" rx="5" fill="#D97706" opacity="0.35"/></svg>`,
  ),
  egg: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#FFFBEB"/><ellipse cx="100" cy="108" rx="58" ry="72" fill="#F9FAFB" stroke="#E5E7EB" stroke-width="2"/><ellipse cx="100" cy="115" rx="26" ry="28" fill="#FCD34D"/><ellipse cx="88" cy="76" rx="18" ry="8" fill="rgba(255,255,255,0.55)"/></svg>`,
  ),
  pizza: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#FFF1F2"/><circle cx="100" cy="100" r="74" fill="#FDE68A"/><circle cx="100" cy="100" r="62" fill="#EF4444"/><circle cx="100" cy="100" r="48" fill="#FBBF24" opacity="0.45"/><circle cx="82" cy="88" r="9" fill="#7F1D1D"/><circle cx="116" cy="92" r="9" fill="#7F1D1D"/><circle cx="98" cy="116" r="9" fill="#7F1D1D"/></svg>`,
  ),
  pencil: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#FFFBEB"/><rect x="86" y="30" width="28" height="120" rx="6" fill="#FDE68A" stroke="#D97706" stroke-width="2"/><polygon points="86,150 114,150 100,178" fill="#F9FAFB" stroke="#D1D5DB" stroke-width="1.5"/><rect x="86" y="30" width="28" height="20" rx="6" fill="#A8A29E"/><rect x="89" y="55" width="4" height="90" rx="2" fill="#D97706" opacity="0.35"/></svg>`,
  ),
  tea: svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#F0FDF4"/><path d="M60 80 Q58 150 100 158 Q142 150 140 80 Z" fill="#D1FAE5" stroke="#6EE7B7" stroke-width="2"/><rect x="60" y="75" width="80" height="12" rx="6" fill="#A7F3D0"/><path d="M140 100 Q162 100 162 115 Q162 130 140 130" fill="none" stroke="#6EE7B7" stroke-width="4" stroke-linecap="round"/><path d="M88 60 Q88 48 96 42" stroke="#86EFAC" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M104 58 Q104 46 112 40" stroke="#86EFAC" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
  ),
};

const nowIso = () => new Date().toISOString();
const stampTime = (iso = nowIso()) =>
  new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso));

const uid = (prefix: string, iso: string) =>
  `${prefix}-${new Date(iso).getTime().toString(36)}-${Math.floor(Math.random() * 900 + 100)}`;

const addLog = (state: AppState, message: string, type: SystemLog['type'], now: string): SystemLog[] => [
  { id: uid('log', now), time: stampTime(now), message, type },
  ...state.logs,
].slice(0, 80);

const addRobotCommandLog = (
  state: AppState,
  now: string,
  entry: Omit<RobotCommandLog, 'id' | 'time' | 'mode' | 'status'>,
): RobotCommandLog[] => [
  {
    id: uid('cmd', now),
    time: stampTime(now),
    mode: state.hardwareMode,
    status: 'queued' as const,
    ...entry,
  },
  ...state.robotCommandLogs,
].slice(0, 80);

const withRobotCommandLog = (
  nextState: AppState,
  previousState: AppState,
  now: string,
  entry: Omit<RobotCommandLog, 'id' | 'time' | 'mode' | 'status'>,
): AppState => ({
  ...nextState,
  robotCommandLogs: addRobotCommandLog(previousState, now, entry),
});

const PRIMARY_ROBOT_ID = '1號';
const PRIMARY_ROBOT_SERIAL = '校園服務機 R-01';
const LEGACY_DELTA_SERIAL = ['Delta', '04'].join(String.fromCharCode(45));
const LEGACY_DELTA_SERIAL_PATTERN = new RegExp(LEGACY_DELTA_SERIAL, 'g');

const selectPrimaryRobotId = (state: Pick<AppState, 'robots'>) => state.robots[0]?.id ?? PRIMARY_ROBOT_ID;

const normalizeRobotTarget = (target?: string) => {
  if (!target) return target;
  return ['2號', '3號', '4號', LEGACY_DELTA_SERIAL, '服務機-02', '服務機-03', '服務機-04'].includes(target)
    ? PRIMARY_ROBOT_ID
    : target;
};

const normalizeLegacyRobotText = (value: string) =>
  value
    .replace(LEGACY_DELTA_SERIAL_PATTERN, PRIMARY_ROBOT_SERIAL)
    .replace(/Delta 機器人/g, PRIMARY_ROBOT_SERIAL)
    .replace(/服務機-0[234]/g, PRIMARY_ROBOT_SERIAL);

const robotStateFromTask = (task: CampusTask): Pick<Robot, 'status' | 'position' | 'task' | 'eta' | 'phase' | 'isRunning'> => {
  const text = `${task.title} ${task.detail ?? ''}`;
  if (task.source === 'delivery') {
    return { status: '配送', position: `前往 ${task.area}`, task: task.title, eta: '4分鐘', phase: '配送中', isRunning: true };
  }
  if (task.source === 'dispatch') {
    const isBroadcast = /廣播|疏導/.test(text);
    return {
      status: isBroadcast ? '疏導' : '巡邏',
      position: task.area,
      task: isBroadcast ? '校園廣播' : '自動巡邏',
      eta: '6分鐘',
      phase: isBroadcast ? '廣播中' : '巡邏中',
      isRunning: true,
    };
  }
  if (task.source === 'schedule') {
    return { status: '清掃', position: task.area, task: task.title, eta: '進行中', phase: '清掃中', isRunning: true };
  }
  if (task.source === 'teaching') {
    return { status: '導診', position: task.area, task: task.title, eta: '進行中', phase: '課堂支援', isRunning: true };
  }
  return { status: '巡邏', position: task.area, task: task.title, eta: '進行中', phase: '任務中', isRunning: true };
};

function normalizeSingleRobotDemoState(state: AppState): AppState {
  if (!state.settings.demoMode) return state;
  const hadLegacyFleet = state.robots.length > 1 || state.robots.some((robot) => /Delta|服務機-0[234]/.test(robot.serial));

  const orders = state.orders.map((order) => ({
    ...order,
    robotId: normalizeRobotTarget(order.robotId) ?? PRIMARY_ROBOT_ID,
  }));
  const hasActiveDelivery = orders.some((order) => order.status === 'in_transit');
  const tasks = state.tasks.map((task) => {
    const normalizedTask: CampusTask = {
      ...task,
      robotId: normalizeRobotTarget(task.robotId) ?? (task.source === 'delivery' || task.source === 'dispatch' || task.source === 'schedule' ? PRIMARY_ROBOT_ID : task.robotId),
      title: normalizeLegacyRobotText(task.title),
      detail: typeof task.detail === 'string' ? normalizeLegacyRobotText(task.detail) : task.detail,
    };

    if (normalizedTask.id === 'task-clean-507' && normalizedTask.source === 'schedule' && normalizedTask.status === 'in_progress') {
      return {
        ...normalizedTask,
        status: 'pending' as const,
        detail: '等待生活或派遣頁面啟動；未下指令前不顯示為執行中。',
      };
    }

    if (hadLegacyFleet && normalizedTask.status === 'in_progress' && normalizedTask.source !== 'delivery') {
      return {
        ...normalizedTask,
        status: 'pending' as const,
        detail: normalizedTask.detail ?? '舊版多機示範任務已轉為待啟動，請由對應頁面重新派遣。',
      };
    }

    if (normalizedTask.source === 'delivery' && normalizedTask.status === 'in_progress' && !hasActiveDelivery) {
      return {
        ...normalizedTask,
        status: 'completed' as const,
        completedAt: normalizedTask.completedAt ?? state.lastUpdated,
        detail: normalizedTask.detail ?? '配送訂單已收束。',
      };
    }

    return normalizedTask;
  });

  const activeDeliveryOrder = orders.find((order) => order.status === 'in_transit');
  const activeDeliveryTask = activeDeliveryOrder
    ? tasks.find((task) => task.source === 'delivery' && task.status === 'in_progress' && task.robotId === PRIMARY_ROBOT_ID)
    : undefined;
  const activeTask = activeDeliveryTask ?? tasks.find((task) => task.status === 'in_progress' && task.robotId === PRIMARY_ROBOT_ID);
  const sourceRobot = state.robots.find((robot) => robot.id === PRIMARY_ROBOT_ID) ?? state.robots[0] ?? createDemoAppState().robots[0];
  const taskRobotState = activeDeliveryOrder
    ? {
        status: '配送' as const,
        position: `前往 ${activeDeliveryOrder.destination}`,
        task: `配送 ${activeDeliveryOrder.productName} x${activeDeliveryOrder.quantity}`,
        eta: '4分鐘',
        phase: '配送中',
        isRunning: true,
      }
    : activeTask
      ? robotStateFromTask(activeTask)
      : {
          status: '待命' as const,
          position: '配送中心',
          task: '等待任務指派',
          eta: '--',
          phase: '單機待命',
          isRunning: false,
        };

  return {
    ...state,
    robots: [
      {
        ...sourceRobot,
        id: PRIMARY_ROBOT_ID,
        serial: PRIMARY_ROBOT_SERIAL,
        ...taskRobotState,
      },
    ],
    orders,
    tasks,
    robotCommandLogs: state.robotCommandLogs.map((log) => ({
      ...log,
      label: normalizeLegacyRobotText(log.label),
      target: normalizeRobotTarget(log.target) ?? log.target,
      note: normalizeLegacyRobotText(log.note),
    })),
    logs: state.logs.map((log) => ({
      ...log,
      message: normalizeLegacyRobotText(log.message),
    })),
  };
}

export function createDemoAppState(): AppState {
  const createdAt = '2026-04-29T08:00:00.000+08:00';

  return {
    robots: [
      {
        id: '1號',
        serial: '校園服務機 R-01',
        status: '待命',
        position: '配送中心',
        battery: 100,
        task: '等待任務指派',
        eta: '--',
        phase: '單機待命',
        isRunning: false,
        speed: 1.1,
      },
    ],
    products: [
      {
        id: 1,
        name: '特級厚片土司',
        price: 28,
        desc: '現烤厚片土司，外酥內軟，香氣撲鼻。',
        img: productImages.toast,
        category: 'snacks',
        stock: 12,
      },
      {
        id: 2,
        name: '現煮茶葉蛋',
        price: 16,
        desc: '秘方滷製，香嫩入味，補充蛋白好幫手。',
        img: productImages.egg,
        category: 'snacks',
        stock: 0,
      },
      {
        id: 3,
        name: '義式小披薩',
        price: 40,
        desc: '個人份現烤披薩，濃郁起司即刻享用。',
        img: productImages.pizza,
        category: 'snacks',
        stock: 5,
      },
      {
        id: 4,
        name: '2B 考試鉛筆組',
        price: 22,
        desc: '含橡皮擦與削筆器，臨時考試用品快速配送。',
        img: productImages.pencil,
        category: 'stationery',
        stock: 18,
      },
      {
        id: 5,
        name: '無糖麥茶',
        price: 20,
        desc: '低溫補給飲品，適合體育課後配送。',
        img: productImages.tea,
        category: 'drinks',
        stock: 9,
      },
    ],
    orders: [
      {
        id: 'order-demo-001',
        productId: 1,
        productName: '特級厚片土司',
        quantity: 2,
        destination: '五年級 501 教室',
        status: 'delivered',
        robotId: '1號',
        createdAt: '2026-04-29T07:00:00.000+08:00',
        deliveredAt: '2026-04-29T07:10:00.000+08:00',
      },
      {
        id: 'order-demo-002',
        productId: 3,
        productName: '義式小披薩',
        quantity: 1,
        destination: '六年級 602 教室',
        status: 'delivered',
        robotId: '1號',
        createdAt: '2026-04-29T06:00:00.000+08:00',
        deliveredAt: '2026-04-29T06:12:00.000+08:00',
      },
    ],
    tasks: [
      {
        id: 'task-clean-507',
        title: '打掃 507 教室',
        area: '五年級走廊',
        status: 'pending',
        source: 'schedule',
        robotId: '1號',
        createdAt,
        detail: '等待生活或派遣頁面啟動；未下指令前不顯示為執行中。',
      },
    ],
    schedules: [
      { id: 'schedule1', title: '校區深度清掃', time: '16:30', area: '所有走廊與公共區', kind: 'cleaning' },
      { id: 'schedule2', title: '晨間活力廣播', time: '08:00', area: '全校範圍同步', kind: 'broadcast' },
    ],
    teachingSignals: [
      {
        id: 'sig-12',
        type: 'question',
        name: '學習訊號 A',
        studentId: '12',
        message: '老師，我想再聽一次這段...',
        createdAt,
      },
      {
        id: 'sig-05',
        type: 'alert',
        name: '學習訊號 B',
        studentId: '05',
        message: '座位狀態待老師確認',
        createdAt,
      },
      {
        id: 'sig-08',
        type: 'alert',
        name: '學習訊號 C',
        studentId: '08',
        message: '學習狀態需要關注',
        createdAt,
      },
    ],
    studentReports: {
      '05': {
        studentId: '05',
        name: '學習訊號 B',
        averageFocus: 78,
        distractRate: 3.2,
        learningStyle: '視覺型學習者',
        events: ['10:16 系統提示：座位狀態待確認。'],
      },
      '08': {
        studentId: '08',
        name: '學習訊號 C',
        averageFocus: 74,
        distractRate: 2.7,
        learningStyle: '互動型學習者',
        events: ['10:21 系統提示：學習狀態需要關注。'],
      },
      '12': {
        studentId: '12',
        name: '學習訊號 A',
        averageFocus: 86,
        distractRate: 0.8,
        learningStyle: '提問型學習者',
        events: ['10:41 收到課程提問訊號。'],
      },
    },
    attendance: {
      scanned: false,
      present: 0,
      absent: 0,
      total: 32,
      absentNames: [],
    },
    sensors: { temp: 24.5, hum: 48, aqi: 32 },
    settings: { notifications: true, remindWarning: true, demoMode: true, expectedAttendanceTotal: 30 },
    campusStatus: { isEmergency: false, safetyMode: 'normal' },
    hardwareMode: 'demo',
    robotCommandLogs: [
      {
        id: 'cmd-ready',
        time: '04:12',
        command: 'SYSTEM_READY',
        label: '本機硬體模式啟動',
        target: '本機可測環境',
        source: 'system',
        mode: 'demo',
        status: 'demo-only',
        note: '已啟用本機可測服務；未接實體設備時保留離線指令紀錄，接上後沿用同一任務流程。',
      },
    ],
    logs: [
      { id: 'log-1', time: '04:12', message: '系統：網路介面 eth0 已啟動', type: 'info' },
      { id: 'log-2', time: '04:12', message: 'AI引擎：視覺子系統初始化完成', type: 'info' },
      { id: 'log-3', time: '04:14', message: '警告：區域 B-4 偵測到高人流', type: 'warn' },
      { id: 'log-4', time: '04:15', message: '指令：校園服務機 R-01 已完成待命檢查', type: 'info' },
    ],
    lastUpdated: createdAt,
  };
}

export function createInitialAppState(): AppState {
  return createDemoAppState();
}

function createLiveRobot(): Robot {
  return {
    id: '底盤',
    serial: 'Arduino R4 + L293D',
    status: '待命',
    position: '硬體連線檢查',
    battery: 100,
    task: '等待實機指令',
    eta: '--',
    phase: '實機待命',
    isRunning: false,
    speed: 1.0,
  };
}

function clearDemoData(state: AppState, now: string): AppState {
  return {
    ...state,
    robots: [createLiveRobot()],
    products: [],
    orders: [],
    tasks: [],
    schedules: [],
    teachingSignals: [],
    studentReports: {},
    attendance: {scanned: false, present: 0, absent: 0, total: 0, absentNames: []},
    sensors: {temp: 0, hum: 0, aqi: 0},
    campusStatus: {isEmergency: false, safetyMode: 'normal'},
    hardwareMode: state.hardwareMode === 'serial-ready' ? 'serial-ready' : 'demo',
    robotCommandLogs: [],
    logs: [],
    settings: {...state.settings, demoMode: false},
    lastUpdated: now,
  };
}

export function createDeliveryOrder(payload: CreateDeliveryOrderPayload): AppAction {
  return { type: 'CREATE_DELIVERY_ORDER', payload };
}

export function completeOrder(orderId: string): AppAction {
  return { type: 'COMPLETE_ORDER', payload: { orderId } };
}

export function saveSchedule(payload: SaveSchedulePayload): AppAction {
  return { type: 'SAVE_SCHEDULE', payload };
}

export function resolveTeachingSignal(payload: ResolveTeachingSignalPayload): AppAction {
  return { type: 'RESOLVE_TEACHING_SIGNAL', payload };
}

export function addTeachingSignal(payload: AddTeachingSignalPayload): AppAction {
  return { type: 'ADD_TEACHING_SIGNAL', payload };
}

export function clearTeachingSignals(): AppAction {
  return { type: 'CLEAR_TEACHING_SIGNALS' };
}

export function resetDemoState(): AppAction {
  return { type: 'RESET_DEMO' };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  const now = action.now ?? nowIso();

  switch (action.type) {
    case 'CREATE_DELIVERY_ORDER': {
      const product = state.products.find((item) => item.id === action.payload.productId);
      if (!product || !Number.isInteger(action.payload.quantity) || action.payload.quantity <= 0 || product.stock < action.payload.quantity || !action.payload.destination?.trim()) {
        return {
          ...state,
          logs: addLog(state, '配送中心：訂單建立失敗，庫存不足或商品不存在，硬體未派遣', 'error', now),
          lastUpdated: now,
        };
      }

      const robotId = state.robots.find((robot) => robot.status !== '充電')?.id ?? selectPrimaryRobotId(state);
      const orderId = uid('order', now);
      const taskId = uid('task-delivery', now);
      const order: Order = {
        id: orderId,
        productId: product.id,
        productName: product.name,
        quantity: action.payload.quantity,
        destination: action.payload.destination,
        status: 'in_transit',
        robotId,
        createdAt: now,
      };
      const task: CampusTask = {
        id: taskId,
        title: `配送 ${product.name} x${action.payload.quantity}`,
        area: action.payload.destination,
        status: 'in_progress',
        source: 'delivery',
        robotId,
        createdAt: now,
        detail: `前往 ${action.payload.destination}`,
      };

      return withRobotCommandLog(
        {
          ...state,
          products: state.products.map((item) =>
            item.id === product.id ? { ...item, stock: item.stock - action.payload.quantity } : item,
          ),
          orders: [order, ...state.orders],
          tasks: [task, ...state.tasks],
          robots: state.robots.map((robot) =>
            robot.id === robotId
              ? {
                  ...robot,
                  status: '配送',
                  position: '配送中心出發',
                  task: task.title,
                  eta: '4分鐘',
                  phase: '配送中',
                  isRunning: true,
                }
              : robot,
          ),
          logs: addLog(state, `配送中心：${robotId} 前往 ${action.payload.destination}`, 'info', now),
          lastUpdated: now,
        },
        state,
        now,
        {
          command: 'DELIVERY_START',
          label: `配送 ${product.name} x${action.payload.quantity}`,
          target: action.payload.destination,
          source: 'delivery',
          note: `${robotId} 進入配送流程，橋接服務會嘗試送到 UNO R4。`,
        },
      );
    }

    case 'COMPLETE_ORDER': {
      const order = state.orders.find((item) => item.id === action.payload.orderId);
      if (!order) return state;
      const linkedTaskTitle = `配送 ${order.productName} x${order.quantity}`;

      return withRobotCommandLog(
        {
          ...state,
          orders: state.orders.map((item) =>
            item.id === order.id ? { ...item, status: 'delivered', deliveredAt: now } : item,
          ),
          tasks: state.tasks.map((task) =>
            task.robotId === order.robotId && task.title === linkedTaskTitle
              ? { ...task, status: 'completed', completedAt: now, detail: '已送達並完成取件確認' }
              : task,
          ),
          robots: state.robots.map((robot) =>
            robot.id === order.robotId
              ? {
                  ...robot,
                  status: '待命',
                  position: order.destination,
                  task: '等待下一個任務',
                  eta: '--',
                  phase: '就緒',
                  isRunning: false,
                }
              : robot,
          ),
          logs: addLog(state, `配送完成：${order.productName} 已送達 ${order.destination}`, 'info', now),
          lastUpdated: now,
        },
        state,
        now,
        {
          command: 'DELIVERY_DONE',
          label: `送達 ${order.productName}`,
          target: order.destination,
          source: 'delivery',
          note: `${order.robotId} 完成取件確認，回到待命狀態。`,
        },
      );
    }

    case 'AUTO_COMPLETE_IN_TRANSIT': {
      const transitOrder = state.orders.find((item) => item.status === 'in_transit');
      if (!transitOrder) return state;
      const linkedTaskTitle = `配送 ${transitOrder.productName} x${transitOrder.quantity}`;

      return withRobotCommandLog(
        {
          ...state,
          orders: state.orders.map((item) =>
            item.id === transitOrder.id ? { ...item, status: 'delivered', deliveredAt: now } : item,
          ),
          tasks: state.tasks.map((task) =>
            task.robotId === transitOrder.robotId && task.title === linkedTaskTitle
              ? { ...task, status: 'completed', completedAt: now, detail: '已送達並完成取件確認' }
              : task,
          ),
          robots: state.robots.map((robot) =>
            robot.id === transitOrder.robotId
              ? {
                  ...robot,
                  status: '待命',
                  position: transitOrder.destination,
                  task: '等待下一個任務',
                  eta: '--',
                  phase: '就緒',
                  isRunning: false,
                }
              : robot,
          ),
          logs: addLog(state, `配送完成：${transitOrder.productName} 已送達 ${transitOrder.destination}`, 'info', now),
          lastUpdated: now,
        },
        state,
        now,
        {
          command: 'DELIVERY_DONE',
          label: `送達 ${transitOrder.productName}`,
          target: transitOrder.destination,
          source: 'delivery',
          note: `${transitOrder.robotId} 完成取件確認，回到待命狀態。`,
        },
      );
    }

    case 'SAVE_SCHEDULE': {
      const schedule = state.schedules.find((item) => item.id === action.payload.id);
      const updated = state.schedules.map((item) =>
        item.id === action.payload.id ? { ...item, time: action.payload.time, area: action.payload.area } : item,
      );

      return withRobotCommandLog(
        {
          ...state,
          schedules: updated,
          logs: addLog(
            state,
            `排程更新：${schedule?.title ?? '預約任務'} 改為 ${action.payload.time} / ${action.payload.area}`,
            'info',
            now,
          ),
          lastUpdated: now,
        },
        state,
        now,
        {
          command: schedule?.kind === 'broadcast' ? 'BROADCAST_SCHEDULE' : 'CLEAN_SCHEDULE',
          label: schedule?.title ?? '預約任務更新',
          target: `${action.payload.time} / ${action.payload.area}`,
          source: 'schedule',
          note: '排程已同步到本機可測狀態，橋接服務會嘗試送出硬體提示。',
        },
      );
    }

    case 'SET_ATTENDANCE_SCANNED':
      return withRobotCommandLog(
        {
          ...state,
          attendance: { scanned: true, present: 30, absent: 2, total: 32, absentNames: ['座號 05', '座號 12'] },
          logs: addLog(state, '教學系統：AI 場域點名完成，2 個座位待確認', 'info', now),
          lastUpdated: now,
        },
        state,
        now,
        {
          command: 'TEACH_SCAN',
          label: '課堂點名掃描',
          target: '教室視覺節點',
          source: 'teaching',
          note: '以本機資料完成場域點名校驗，橋接服務會送出教學掃描提示。',
        },
      );

    case 'RECORD_TEACHING_SCAN_TASK': {
      const title = action.payload?.title?.trim() || '教學掃描';
      const detail = action.payload?.detail?.trim() || '教室影像掃描與學習氛圍分析';
      const taskId = action.payload?.id?.trim() || uid('task-teach-scan', now);
      return withRobotCommandLog(
        {
          ...state,
          tasks: [
            {
              id: taskId,
              title,
              area: '101 教室',
              status: 'in_progress',
              source: 'teaching',
              createdAt: now,
              detail,
            },
            ...state.tasks,
          ],
          logs: addLog(state, `教學系統：${title} 已建立任務`, 'info', now),
          lastUpdated: now,
        },
        state,
        now,
        {
          command: 'TEACH_SCAN',
          label: title,
          target: '101 教室',
          source: 'teaching',
          note: detail,
        },
      );
    }

    case 'COMPLETE_TEACHING_SCAN_TASK': {
      const task = state.tasks.find((item) => item.id === action.payload.id);
      if (!task || task.source !== 'teaching' || task.status === 'completed') return state;
      return {
        ...state,
        tasks: state.tasks.map((item) =>
          item.id === task.id
            ? {...item, status: 'completed', completedAt: now, detail: action.payload.detail?.trim() || item.detail || '分析結果已輸出'}
            : item,
        ),
        logs: addLog(state, `教學系統：${task.title} 已完成`, 'info', now),
        lastUpdated: now,
      };
    }

    case 'ADD_TEACHING_SIGNAL': {
      const trimmedMessage = action.payload.message.trim();
      if (!trimmedMessage) return state;
      const incomingKey = teachingSignalDedupKey(action.payload.type, action.payload.name, trimmedMessage);
      const duplicate = state.teachingSignals.some((item) =>
        teachingSignalDedupKey(item.type, item.name, item.message) === incomingKey,
      );
      if (duplicate) return state;
      const signal: TeachingSignal = {
        id: action.payload.id ?? `vision-${Date.parse(now)}-${Math.random().toString(36).slice(2, 7)}`,
        type: action.payload.type,
        name: action.payload.name,
        studentId: action.payload.studentId,
        message: trimmedMessage,
        createdAt: now,
        visual: action.payload.visual,
      };

      return {
        ...state,
        teachingSignals: [signal, ...state.teachingSignals].slice(0, 8),
        logs: addLog(state, `教學即時告警：${signal.message}`, 'warn', now),
        lastUpdated: now,
      };
    }

    case 'CLEAR_TEACHING_SIGNALS':
      return {
        ...state,
        teachingSignals: [],
        lastUpdated: now,
      };

    case 'RESOLVE_TEACHING_SIGNAL': {
      const signal = state.teachingSignals.find((item) => item.id === action.payload.signalId);
      if (!signal) return state;
      const report = state.studentReports[signal.studentId] ?? {
        studentId: signal.studentId,
        name: signal.name,
        averageFocus: 80,
        distractRate: 1.5,
        learningStyle: '待分析',
        events: [],
      };

      return withRobotCommandLog(
        {
          ...state,
          teachingSignals: state.teachingSignals.filter((item) => item.id !== signal.id),
          studentReports: {
            ...state.studentReports,
            [signal.studentId]: {
              ...report,
              events: [`${stampTime(now)} ${action.payload.action}：${signal.message}`, ...report.events].slice(0, 12),
            },
          },
          logs: addLog(state, `教學告警已處理：${signal.name} / ${action.payload.action}`, 'info', now),
          lastUpdated: now,
        },
        state,
        now,
        {
          command: signal.type === 'alert' ? 'FOCUS_NUDGE' : 'QUESTION_ACK',
          label: `${signal.name} 訊號處理`,
          target: signal.type === 'alert' ? '教室提醒模組' : '課堂提問佇列',
          source: 'teaching',
          note: action.payload.action,
        },
      );
    }

    case 'ADD_TEACHER_REPLY': {
      if (!action.payload.reply?.trim()) return state;
      const signal = state.teachingSignals.find((item) => item.id === action.payload.signalId);
      if (!signal) return state;
      const report = state.studentReports[signal.studentId] ?? {
        studentId: signal.studentId,
        name: signal.name,
        averageFocus: 80,
        distractRate: 1.5,
        learningStyle: '待分析',
        events: [],
      };

      return withRobotCommandLog(
        {
          ...state,
          teachingSignals: state.teachingSignals.filter((item) => item.id !== signal.id),
          studentReports: {
            ...state.studentReports,
            [signal.studentId]: {
              ...report,
              events: [
                `${stampTime(now)} 教師回覆：「${action.payload.reply}」`,
                ...report.events,
              ].slice(0, 12),
            },
          },
          logs: addLog(state, `教學互動：已回覆 ${signal.name} 的提問`, 'info', now),
          lastUpdated: now,
        },
        state,
        now,
        {
          command: 'TEACH_REPLY',
          label: `${signal.name} 課業問答`,
          target: '教室小聲問答模組',
          source: 'teaching',
          note: action.payload.reply,
        },
      );
    }

    case 'SET_EMERGENCY':
      return withRobotCommandLog(
        {
          ...state,
          campusStatus: {
            ...state.campusStatus,
            isEmergency: action.payload.enabled,
            safetyMode: action.payload.enabled ? 'lockdown' : 'normal',
          },
          logs: addLog(
            state,
            action.payload.enabled ? '安全系統：全校安全封鎖啟動' : '安全系統：封鎖解除，恢復一般模式',
            action.payload.enabled ? 'warn' : 'info',
            now,
          ),
          lastUpdated: now,
        },
        state,
        now,
        {
          command: action.payload.enabled ? 'SAFETY_LOCKDOWN' : 'SAFETY_CLEAR',
          label: action.payload.enabled ? '全校安全封鎖' : '解除安全封鎖',
          target: '校園安全模組',
          source: 'life',
          note: action.payload.enabled ? '比賽操作資料：門禁、廣播、巡邏同步啟動。' : '比賽操作資料：恢復一般校園服務。',
        },
      );

    case 'SET_NOTIFICATIONS':
      return {
        ...state,
        settings: { ...state.settings, notifications: action.payload.enabled },
        logs: addLog(
          state,
          action.payload.enabled ? '系統：緊急推播已開啟' : '系統：緊急推播已關閉',
          'info',
          now,
        ),
        lastUpdated: now,
      };

    case 'SET_REMIND_WARNING':
      return withRobotCommandLog(
        {
          ...state,
          settings: { ...state.settings, remindWarning: action.payload.enabled },
          logs: addLog(
            state,
            action.payload.enabled ? '生活系統：智慧鐘聲提示已開啟' : '生活系統：智慧鐘聲提示已關閉',
            'info',
            now,
          ),
          lastUpdated: now,
        },
        state,
        now,
        {
          command: action.payload.enabled ? 'BELL_REMIND_ON' : 'BELL_REMIND_OFF',
          label: action.payload.enabled ? '開啟智慧鐘聲' : '關閉智慧鐘聲',
          target: '全校廣播節點',
          source: 'life',
          note: '下課結束前一分鐘提醒，對應作品說明書的時間管理功能。',
        },
      );

    case 'SET_EXPECTED_ATTENDANCE_TOTAL':
      return {
        ...state,
        settings: { ...state.settings, expectedAttendanceTotal: Math.max(1, Math.min(99, Math.round(action.payload.total))) },
        logs: addLog(state, `帳號設定：點名應到人數調整為 ${Math.max(1, Math.min(99, Math.round(action.payload.total)))} 人`, 'info', now),
        lastUpdated: now,
      };

    case 'SET_DEMO_MODE': {
      if (action.payload.enabled) {
        return {
          ...createDemoAppState(),
          hardwareMode: state.hardwareMode,
          settings: {...state.settings, demoMode: true},
          lastUpdated: now,
          logs: addLog(createDemoAppState(), '系統：比賽操作資料已載入', 'info', now),
        };
      }
      return clearDemoData(
        {
          ...state,
          logs: addLog(state, '系統：操作資料已清空', 'info', now),
        },
        now,
      );
    }

    case 'ADD_DISPATCH_TASK': {
      const zoneLabel = action.payload.zone.trim() || '未指定區域';
      const broadcastMessage = action.payload.message?.trim();
      const sourceTitle = action.payload.taskType === 'broadcast' ? '校園廣播' : '自動巡邏';
      const robotId = selectPrimaryRobotId(state);
      const status: RobotStatus = action.payload.taskType === 'broadcast' ? '疏導' : '巡邏';
      const taskDetail = action.payload.taskType === 'broadcast'
        ? `廣播內容：${broadcastMessage || '校園廣播與人流疏導'}`
        : '巡邏熱區並回傳影像';

      return withRobotCommandLog(
        {
          ...state,
          campusStatus: { ...state.campusStatus, activeZone: zoneLabel },
          tasks: [
            {
              id: uid('task-dispatch', now),
              title: `${sourceTitle} - ${zoneLabel}`,
              area: zoneLabel,
              status: 'in_progress',
              source: 'dispatch',
              robotId,
              createdAt: now,
              detail: taskDetail,
            },
            ...state.tasks,
          ],
          robots: state.robots.map((robot) =>
            robot.id === robotId
              ? {
                  ...robot,
                  status,
                  position: zoneLabel,
                  task: sourceTitle,
                  eta: '6分鐘',
                  phase: action.payload.taskType === 'broadcast' ? '廣播中' : '巡邏中',
                  isRunning: true,
                }
              : robot,
          ),
          logs: addLog(state, action.payload.taskType === 'broadcast'
            ? `派遣中心：${robotId} 已對 ${zoneLabel} 發送廣播「${broadcastMessage || '校園廣播'}」`
            : `派遣中心：${robotId} 已前往 ${zoneLabel} 執行${sourceTitle}`, 'info', now),
          lastUpdated: now,
        },
        state,
        now,
        {
          command: action.payload.taskType === 'broadcast' ? 'BROADCAST_START' : 'PATROL_START',
          label: `${sourceTitle} - ${zoneLabel}`,
          target: robotId,
          source: 'dispatch',
          note: action.payload.taskType === 'broadcast' ? `廣播訊息：${broadcastMessage || '疏導廣播與人流提醒。'}` : '巡邏熱區並回傳影像。',
        },
      );
    }

    case 'COMPLETE_DISPATCH_TASK': {
      const sourceTitle = action.payload.taskType === 'broadcast' ? '群眾疏導' : '自動巡邏';
      const robotId = selectPrimaryRobotId(state);
      const zoneLabel = action.payload.zone.trim() || '未指定區域';
      let completed = false;
      return {
        ...state,
        tasks: state.tasks.map((task) => {
          const sameZone = task.area === zoneLabel || task.area === `區域 ${zoneLabel}`;
          if (completed || task.source !== 'dispatch' || !sameZone || task.status === 'completed') {
            return task;
          }
          completed = true;
          return {...task, status: 'completed', completedAt: now, detail: `${sourceTitle}已回報完成`};
        }),
        robots: state.robots.map((robot) =>
          robot.id === robotId
            ? {...robot, status: '待命', task: '回到待命點', eta: '完成', phase: '就緒', isRunning: false}
            : robot,
        ),
        logs: addLog(state, `派遣中心：${zoneLabel} ${sourceTitle}已完成`, 'info', now),
        lastUpdated: now,
      };
    }

    case 'SET_ROBOT_MODE': {
      const modeMeta: Record<RobotStatus, {task: string; position: string; phase: string; command: string}> = {
        待命: {task: '等待中控指派', position: '服務站', phase: '就緒', command: 'MODE_STANDBY'},
        充電: {task: '返回充電座', position: '充電區', phase: '充電中', command: 'MODE_CHARGE'},
        導診: {task: '協助訪客導覽', position: '玄關服務點', phase: '導引中', command: 'MODE_GUIDE'},
        清掃: {task: '教室/走廊清潔', position: '清潔路線起點', phase: '清掃中', command: 'MODE_CLEAN'},
        配送: {task: '校園物品配送', position: '配送中心', phase: '配送待命', command: 'MODE_DELIVERY'},
        巡邏: {task: '校園巡邏', position: '巡邏起點', phase: '巡邏中', command: 'MODE_PATROL'},
        疏導: {task: '人流廣播疏導', position: '走廊熱區', phase: '疏導中', command: 'MODE_BROADCAST'},
      };
      const meta = modeMeta[action.payload.status];
      return withRobotCommandLog(
        {
          ...state,
          robots: state.robots.map((robot) =>
            robot.id === action.payload.robotId
              ? {
                  ...robot,
                  status: action.payload.status,
                  task: meta.task,
                  position: meta.position,
                  phase: meta.phase,
                  eta: action.payload.status === '待命' ? '待命' : '即時',
                  isRunning: !['待命', '充電'].includes(action.payload.status),
                }
              : robot,
          ),
          logs: addLog(state, `模式切換：${action.payload.robotId} 進入${action.payload.status}模式`, 'info', now),
          lastUpdated: now,
        },
        state,
        now,
        {
          command: meta.command,
          label: `${action.payload.status}模式`,
          target: action.payload.robotId,
          source: 'system',
          note: `主導覽切換，${action.payload.robotId} 進入${action.payload.status}模式。`,
        },
      );
    }

    case 'SET_ROBOT_RUNNING':
      return withRobotCommandLog(
        {
          ...state,
          robots: state.robots.map((robot) =>
            robot.id === action.payload.robotId ? { ...robot, isRunning: action.payload.running } : robot,
          ),
          logs: addLog(
            state,
            `${action.payload.robotId} ${action.payload.running ? '恢復執行' : '暫停執行'}`,
            'info',
            now,
          ),
          lastUpdated: now,
        },
        state,
        now,
        {
          command: action.payload.running ? 'ROBOT_RESUME' : 'ROBOT_PAUSE',
          label: action.payload.running ? '恢復任務' : '暫停任務',
          target: action.payload.robotId,
          source: 'system',
          note: '中控台任務控制，橋接服務會嘗試同步到 UNO R4。',
        },
      );

    case 'SET_ROBOT_SPEED':
      return withRobotCommandLog(
        {
          ...state,
          robots: state.robots.map((robot) =>
            robot.id === action.payload.robotId ? { ...robot, speed: action.payload.speed } : robot,
          ),
          logs: addLog(state, `${action.payload.robotId} 巡航速度設定為 ${action.payload.speed.toFixed(1)} m/s`, 'info', now),
          lastUpdated: now,
        },
        state,
        now,
        {
          command: 'SPEED_SET',
          label: `速度 ${action.payload.speed.toFixed(1)} m/s`,
          target: action.payload.robotId,
          source: 'system',
          note: '本機校準操作速度，實機需轉換成馬達 PWM 或速度控制參數。',
        },
      );

    case 'TICK_SENSORS':
      return {
        ...state,
        sensors: action.payload,
        lastUpdated: now,
      };

    case 'CLEAR_LOCAL_CACHE':
      return {
        ...state,
        logs: addLog(state, '系統：已清除本地緩存標記', 'info', now),
        lastUpdated: now,
      };

    case 'MARK_HARDWARE_COMMAND':
      return {
        ...state,
        hardwareMode: action.payload.ok && !action.payload.simulated ? 'serial-ready' : state.hardwareMode,
        robotCommandLogs: state.robotCommandLogs.map((log) =>
          log.id === action.payload.id
            ? {
                ...log,
                mode: action.payload.ok && !action.payload.simulated ? 'serial-ready' : log.mode,
                status: action.payload.ok ? (action.payload.simulated ? 'simulated' : 'sent') : 'failed',
                note: action.payload.ok
                  ? `${log.note}${log.note ? ' · ' : ''}${action.payload.simulated ? '離線指令完成' : `Arduino：${action.payload.message}`}`
                  : action.payload.message,
              }
            : log,
        ),
        logs: addLog(
          state,
          action.payload.ok
            ? action.payload.simulated ? `離線指令：${action.payload.message}` : `Arduino：${action.payload.message}`
            : `Arduino 離線紀錄：${action.payload.message}`,
          action.payload.ok ? 'info' : 'warn',
          now,
        ),
        lastUpdated: now,
      };

    case 'RESTORE_DEMO_STATE':
      return {
        ...action.payload.state,
        lastUpdated: now,
        logs: addLog(action.payload.state, '系統：已匯入操作資料並完成安全修復', 'info', now),
      };

    case 'RESET_DEMO':
      return state.settings.demoMode
        ? {
            ...createDemoAppState(),
            hardwareMode: state.hardwareMode,
            settings: {...state.settings, demoMode: true},
            lastUpdated: now,
            logs: addLog(createDemoAppState(), '系統：操作資料已重置', 'info', now),
          }
        : clearDemoData(state, now);

    default:
      return state;
  }
}

export function loadPersistedState(): AppState {
  if (typeof window === 'undefined') return createInitialAppState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialAppState();
    const normalized = normalizePersistedState(JSON.parse(raw));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    const initial = createInitialAppState();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
}

export function persistState(state: AppState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    if (error instanceof DOMException && (error.code === 22 || error.name === 'QuotaExceededError')) {
      try {
        const trimmed = {...state, logs: state.logs.slice(0, 30), robotCommandLogs: state.robotCommandLogs.slice(0, 30)};
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch {
        // give up gracefully — in-memory state is still correct
      }
    }
  }
}

export function normalizePersistedState(input: unknown): AppState {
  const fallback = createDemoAppState();
  if (!input || typeof input !== 'object') return createInitialAppState();

  const parsed = input as Partial<AppState>;
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;
  const text = (value: unknown, fallbackText: string) =>
    typeof value === 'string' && value.trim() ? value : fallbackText;
  const number = (value: unknown, fallbackNumber: number, min = 0, max = 10000) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallbackNumber;
  const bool = (value: unknown, fallbackBoolean: boolean) =>
    typeof value === 'boolean' ? value : fallbackBoolean;
  const normalizeList = <T>(value: unknown, fallbackItems: T[], normalize: (item: unknown, fallbackItem: T, index: number) => T | null) => {
    if (!Array.isArray(value) || fallbackItems.length === 0) return fallbackItems;
    const items = value
      .map((item, index) => normalize(item, fallbackItems[index % fallbackItems.length], index))
      .filter((item): item is T => Boolean(item));
    return items.length > 0 ? items : fallbackItems;
  };

  const normalized: AppState = {
    ...fallback,
    ...parsed,
    robots: normalizeList(parsed.robots, fallback.robots, (item, robot) => {
      if (!isRecord(item)) return null;
      return {
        ...robot,
        id: text(item.id, robot.id),
        serial: text(item.serial, robot.serial),
        status: ['待命', '充電', '導診', '清掃', '配送', '巡邏', '疏導'].includes(String(item.status)) ? item.status as RobotStatus : robot.status,
        position: text(item.position, robot.position),
        battery: number(item.battery, robot.battery, 0, 100),
        task: text(item.task, robot.task),
        eta: text(item.eta, robot.eta),
        phase: text(item.phase, robot.phase),
        isRunning: bool(item.isRunning, robot.isRunning),
        speed: number(item.speed, robot.speed, 0, 5),
      };
    }),
    products: normalizeList(parsed.products, fallback.products, (item, product) => {
      if (!isRecord(item)) return null;
      return {
        ...product,
        id: number(item.id, product.id),
        name: text(item.name, product.name),
        price: number(item.price, product.price, 0, 9999),
        desc: text(item.desc, product.desc),
        img: text(item.img, product.img),
        category: item.category === 'snacks' || item.category === 'stationery' || item.category === 'drinks' ? item.category : product.category,
        stock: number(item.stock, product.stock, 0, 999),
      };
    }),
    orders: Array.isArray(parsed.orders)
      ? parsed.orders
          .map((item, index): Order | null => {
            if (!isRecord(item)) return null;
            const order: Order = fallback.orders[index % Math.max(1, fallback.orders.length)] ?? {
              id: `recovered-order-${index + 1}`,
              productId: fallback.products[0]?.id ?? 1,
              productName: fallback.products[0]?.name ?? '未知商品',
              quantity: 1,
              destination: '總務處',
              status: 'in_transit',
              robotId: fallback.robots[0]?.id ?? 'R001',
              createdAt: fallback.lastUpdated,
            };
            return {
              ...order,
              id: text(item.id, order.id),
              productId: number(item.productId, order.productId),
              productName: text(item.productName, order.productName),
              quantity: number(item.quantity, order.quantity, 1, 99),
              destination: text(item.destination, order.destination),
              status: item.status === 'delivered' || item.status === 'in_transit' ? item.status : order.status,
              robotId: text(item.robotId, order.robotId),
              createdAt: text(item.createdAt, order.createdAt),
              deliveredAt: typeof item.deliveredAt === 'string' ? item.deliveredAt : order.deliveredAt,
            };
          })
          .filter((order): order is Order => Boolean(order))
      : fallback.orders,
    tasks: normalizeList(parsed.tasks, fallback.tasks, (item, task) => {
      if (!isRecord(item)) return null;
      return {
        ...task,
        id: text(item.id, task.id),
        title: text(item.title, task.title),
        area: text(item.area, task.area),
        status: item.status === 'pending' || item.status === 'in_progress' || item.status === 'completed' ? item.status : task.status,
        source: ['delivery', 'schedule', 'dispatch', 'teaching', 'life'].includes(String(item.source)) ? item.source as TaskSource : task.source,
        robotId: typeof item.robotId === 'string' ? item.robotId : task.robotId,
        createdAt: text(item.createdAt, task.createdAt),
        completedAt: typeof item.completedAt === 'string' ? item.completedAt : task.completedAt,
        detail: typeof item.detail === 'string' ? item.detail : task.detail,
      };
    }),
    schedules: normalizeList(parsed.schedules, fallback.schedules, (item, schedule) => {
      if (!isRecord(item)) return null;
      return {
        ...schedule,
        id: text(item.id, schedule.id),
        title: text(item.title, schedule.title),
        time: text(item.time, schedule.time),
        area: text(item.area, schedule.area),
        kind: item.kind === 'cleaning' || item.kind === 'broadcast' ? item.kind : schedule.kind,
      };
    }),
    teachingSignals: normalizeList(parsed.teachingSignals, fallback.teachingSignals, (item, signal) => {
      if (!isRecord(item)) return null;
      return {
        ...signal,
        id: text(item.id, signal.id),
        type: item.type === 'question' || item.type === 'alert' ? item.type : signal.type,
        name: text(item.name, signal.name),
        studentId: text(item.studentId, signal.studentId),
        message: text(item.message, signal.message),
        createdAt: text(item.createdAt, signal.createdAt),
        visual: isRecord(item.visual) && typeof item.visual.imageDataUrl === 'string' && typeof item.visual.markerLabel === 'string'
          ? {
            imageDataUrl: item.visual.imageDataUrl,
            markerLabel: item.visual.markerLabel,
            markerBoxes: (Array.isArray(item.visual.markerBoxes) ? item.visual.markerBoxes : isRecord(item.visual.markerBox) ? [item.visual.markerBox] : [])
              .filter(isRecord)
              .map((box) => ({
                x: number(box.x, 0, 0, 100),
                y: number(box.y, 0, 0, 100),
                width: number(box.width, 0, 0, 100),
                height: number(box.height, 0, 0, 100),
              })),
          }
          : signal.visual,
      };
    }),
    studentReports: parsed.studentReports && typeof parsed.studentReports === 'object' ? parsed.studentReports : fallback.studentReports,
    attendance: isRecord(parsed.attendance) ? {
      scanned: bool(parsed.attendance.scanned, fallback.attendance.scanned),
      present: number(parsed.attendance.present, fallback.attendance.present, 0, 999),
      absent: number(parsed.attendance.absent, fallback.attendance.absent, 0, 999),
      total: number(parsed.attendance.total, fallback.attendance.total, 0, 999),
      absentNames: Array.isArray(parsed.attendance.absentNames) ? parsed.attendance.absentNames.filter((name): name is string => typeof name === 'string') : fallback.attendance.absentNames,
    } : fallback.attendance,
    sensors: isRecord(parsed.sensors) ? {
      temp: number(parsed.sensors.temp, fallback.sensors.temp, -20, 80),
      hum: number(parsed.sensors.hum, fallback.sensors.hum, 0, 100),
      aqi: number(parsed.sensors.aqi, fallback.sensors.aqi, 0, 500),
    } : fallback.sensors,
    settings: isRecord(parsed.settings) ? {
      notifications: bool(parsed.settings.notifications, fallback.settings.notifications),
      remindWarning: bool(parsed.settings.remindWarning, fallback.settings.remindWarning),
      demoMode: bool(parsed.settings.demoMode, false),
      expectedAttendanceTotal: number(parsed.settings.expectedAttendanceTotal, fallback.settings.expectedAttendanceTotal ?? 30, 1, 99),
    } : {...fallback.settings, demoMode: false, expectedAttendanceTotal: fallback.settings.expectedAttendanceTotal ?? 30},
    campusStatus: isRecord(parsed.campusStatus) ? {
      isEmergency: bool(parsed.campusStatus.isEmergency, fallback.campusStatus.isEmergency),
      safetyMode: parsed.campusStatus.safetyMode === 'lockdown' ? 'lockdown' : 'normal',
      activeZone: typeof parsed.campusStatus.activeZone === 'string' ? parsed.campusStatus.activeZone : fallback.campusStatus.activeZone,
    } : fallback.campusStatus,
    hardwareMode: parsed.hardwareMode === 'serial-ready' ? 'serial-ready' : 'demo',
    robotCommandLogs: normalizeList(parsed.robotCommandLogs, fallback.robotCommandLogs, (item, log) => {
      if (!isRecord(item)) return null;
      return {
        ...log,
        id: text(item.id, log.id),
        time: text(item.time, log.time),
        command: text(item.command, log.command),
        label: text(item.label, log.label),
        target: text(item.target, log.target),
        source: ['delivery', 'schedule', 'dispatch', 'teaching', 'life', 'system'].includes(String(item.source)) ? item.source as RobotCommandLog['source'] : log.source,
        mode: item.mode === 'serial-ready' ? 'serial-ready' : 'demo',
        status: item.status === 'queued' || item.status === 'sent' || item.status === 'simulated' || item.status === 'failed' ? item.status : 'demo-only',
        note: text(item.note, log.note),
      };
    }),
    logs: normalizeList(parsed.logs, fallback.logs, (item, log) => {
      if (!isRecord(item)) return null;
      return {
        id: text(item.id, log.id),
        time: text(item.time, log.time),
        message: text(item.message, log.message),
        type: item.type === 'warn' || item.type === 'error' || item.type === 'info' ? item.type : log.type,
      };
    }),
    lastUpdated: typeof parsed.lastUpdated === 'string' ? parsed.lastUpdated : fallback.lastUpdated,
  };

  return normalizeSingleRobotDemoState(normalized);
}
