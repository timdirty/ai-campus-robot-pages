import {
  AcousticSignal,
  AcousticLevel,
  AlertStatus,
  ForestPost,
  GuardianAlert,
  HardwareEvent,
  GuardianNode,
  GuardianState,
  Intervention,
  MoodType,
  RiskLevel,
  RobotMission,
  SupportMessage,
} from '../types';

export const GUARDIAN_STORAGE_KEY = 'mindful-guardian:v1';

const nowIso = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 900 + 100)}`;

function hasMojibake(value: unknown): boolean {
  return typeof value === 'string' && /[�\uE000-\uF8FF]|ï¿½|Ã|Â|[撌瘜隢璈鈭嚗蝘蝣摰雿霈]/.test(value);
}

function cleanStoredText(value: unknown, fallbackText: string): string {
  return typeof value === 'string' && value.trim() && !hasMojibake(value) ? value.trim() : fallbackText;
}

const timeLabel = (iso = nowIso()) =>
  new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));

export type GuardianAction =
  | {type: 'TOGGLE_PRIVACY'}
  | {type: 'UPDATE_ALERT_STATUS'; payload: {id: string; status: AlertStatus}}
  | {type: 'TOGGLE_CHECKLIST'; payload: {alertId: string; itemId: string}}
  | {type: 'ADD_MOOD'; payload: {mood: MoodType; label: string; note: string}}
  | {type: 'ADD_FOREST_POST'; payload: {id: string; content: string; type: ForestPost['type']}}
  | {type: 'LIKE_FOREST_POST'; payload: {id: string}}
  | {type: 'SET_FOREST_POST_REPLY'; payload: {id: string; botReply: string}}
  | {type: 'ADD_SUPPORT_MESSAGE'; payload: Omit<SupportMessage, 'id' | 'createdAt'>}
  | {type: 'DEPLOY_INTERVENTION'; payload: {area: string}}
  | {type: 'RESTART_NODE'; payload: {id: string}}
  | {type: 'RECORD_HARDWARE_EVENT'; payload: Omit<HardwareEvent, 'id' | 'createdAt'>}
  | {type: 'RECORD_ACOUSTIC_SIGNAL'; payload: Omit<AcousticSignal, 'id' | 'createdAt'>}
  | {type: 'CREATE_ACOUSTIC_ALERT'; payload: Omit<AcousticSignal, 'id' | 'createdAt' | 'source'>}
  | {type: 'CREATE_PROACTIVE_ALERT'; payload: {location: string; title: string; description: string; riskLevel: RiskLevel; score: number}}
  | {type: 'CREATE_CONTEXT_ALERT'; payload: {location: string; type: string; description: string; riskLevel: Exclude<RiskLevel, 'low'>; category: string; studentAlias?: string; className?: string}}
  | {type: 'DISPATCH_ROBOT'; payload: {zoneName: string; riskScore: number; command: string}}
  | {type: 'UPDATE_ROBOT_MISSION_STATUS'; payload: {zoneName: string; status: RobotMission['status']}}
  | {type: 'RESTORE_DEMO_STATE'; payload: {state: GuardianState}}
  | {type: 'RESET_DEMO'};

const alerts: GuardianAlert[] = [
  {
    id: 'alert-a1',
    studentAlias: '匿名關懷訊號 A',
    className: '八年一班',
    location: '圖書館走廊',
    time: '今天 10:45',
    type: '關懷提醒',
    description: '匿名場域與自填訊號顯示，圖書館走廊連續兩節下課互動偏低。建議老師先用溫和方式關心近況。',
    riskLevel: 'high',
    category: '同儕互動',
    status: 'new',
    checklist: [
      {id: 'a1-c1', text: '導師先觀察下課互動', completed: true},
      {id: 'a1-c2', text: '安排短時間關懷談話', completed: false},
      {id: 'a1-c3', text: '必要時轉介輔導室', completed: false},
    ],
  },
  {
    id: 'alert-a2',
    studentAlias: '匿名關懷訊號 B',
    className: '九年三班',
    location: '三樓教室',
    time: '今天 13:20',
    type: '壓力升高',
    description: '模擬考後情緒量表與課堂回饋顯示壓力偏高。建議提供考前整理方法與休息提醒。',
    riskLevel: 'medium',
    category: '課業壓力',
    status: 'processing',
    checklist: [
      {id: 'a2-c1', text: '確認是否需要補救教學', completed: true},
      {id: 'a2-c2', text: '提供考前任務拆解表', completed: false},
    ],
  },
  {
    id: 'alert-a3',
    studentAlias: '匿名關懷訊號 C',
    className: '七年二班',
    location: '操場',
    time: '昨天 16:05',
    type: '專注力波動',
    description: '體育課後回到教室的專注度下降，建議安排兩分鐘收心呼吸或座位調整。',
    riskLevel: 'low',
    category: '專注狀態',
    status: 'resolved',
    checklist: [
      {id: 'a3-c1', text: '完成課後觀察紀錄', completed: true},
      {id: 'a3-c2', text: '回報導師處理結果', completed: true},
    ],
  },
];

const nodes: GuardianNode[] = [
  {id: 'node-library', name: '圖書館節點', location: '圖書館 3F', status: 'online', latencyMs: 12, load: 28, signal: 96, lastEvent: '偵測到安靜區人流回升'},
  {id: 'node-hall', name: '穿堂節點', location: '行政大樓 1F', status: 'attention', latencyMs: 21, load: 74, signal: 88, lastEvent: '下課人流密集，建議疏導'},
  {id: 'node-restroom', name: '隱蔽區環境節點', location: '操場側廁所外', status: 'online', latencyMs: 16, load: 42, signal: 91, lastEvent: '環境聲量正常'},
  {id: 'node-gym', name: '體育館節點', location: '體育館入口', status: 'offline', latencyMs: 0, load: 0, signal: 0, lastEvent: '等待重新連線'},
];

const forestPosts: ForestPost[] = [
  {id: 'post-1', content: '今天有人陪我一起去找老師問問題，感覺比較不緊張。', type: 'gratitude', likes: 12, createdAt: '今天 09:30'},
  {id: 'post-2', content: '如果今天也覺得累，先喝水、慢慢呼吸，一步一步來。', type: 'support', likes: 18, createdAt: '今天 11:05'},
  {id: 'post-3', content: '我發現寫下三件做得到的小事，比一直想大目標更有用。', type: 'thought', likes: 7, createdAt: '昨天 15:40'},
];

const interventions: Intervention[] = [
  {
    id: 'int-1',
    title: '課間安心角落',
    description: '圖書館旁設置安靜座位與引導卡，讓學生可以短暫整理心情。',
    status: 'running',
    area: '圖書館走廊',
    updatedAt: '今天 10:50',
  },
  {
    id: 'int-2',
    title: '考前任務拆解',
    description: '九年級班級使用小步驟讀書單，降低一次面對整份考卷的壓力。',
    status: 'planned',
    area: '九年級教室',
    updatedAt: '今天 13:40',
  },
];

const acousticSignals: AcousticSignal[] = [
  {
    id: 'sound-1',
    source: 'demo',
    location: '穿堂',
    level: 'active',
    volumeIndex: 58,
    volatility: 18,
    summary: '下課人流經過，環境聲量有活動感，持續觀察即可。',
    createdAt: '今天 10:10',
  },
];

const robotMissions: RobotMission[] = [
  {
    id: 'mission-1',
    zoneName: '圖書館',
    riskScore: 74,
    status: 'arrived',
    command: 'CARE_DEPLOYED',
    createdAt: '今天 10:52',
  },
];

export function createInitialGuardianState(): GuardianState {
  const createdAt = '2026-04-29T08:00:00.000+08:00';
  return {
    stabilityScore: 78,
    teacherWellbeingScore: 82,
    privacyMode: true,
    alerts: alerts.slice(0, 2),
    nodes,
    moodLogs: [
      {id: 'mood-1', mood: 'steady', label: '還可以', note: '早自習後比較穩定', createdAt: '今天 08:20'},
      {id: 'mood-2', mood: 'worried', label: '有點擔心', note: '考前班級壓力偏高', createdAt: '昨天 14:10'},
    ],
    supportMessages: [
      {
        id: 'msg-1',
        role: 'guardian',
        content: '你好！我是你的校園心靈守護者 🌱。不管今天開心還是有點難受，都可以在這裡說說。我會陪著你，一起想想怎麼面對。',
        createdAt,
      },
    ],
    forestPosts,
    interventions,
    hardwareEvents: [
      {
        id: 'hw-ready',
        command: 'SYSTEM_READY',
        source: 'system',
        status: 'fallback',
        message: '本機橋接服務已就緒；未連接 UNO R4 時自動切換備援模式，連接後指令將透過序列埠傳輸。',
        createdAt: '今天 08:00',
      },
    ],
    acousticSignals,
    robotMissions,
    lastUpdated: createdAt,
  };
}

export function guardianReducer(state: GuardianState, action: GuardianAction): GuardianState {
  const now = nowIso();
  switch (action.type) {
    case 'TOGGLE_PRIVACY':
      return {...state, privacyMode: !state.privacyMode, lastUpdated: now};

    case 'UPDATE_ALERT_STATUS':
      return {
        ...state,
        alerts: state.alerts.map((alert) =>
          alert.id === action.payload.id ? {...alert, status: action.payload.status} : alert,
        ),
        lastUpdated: now,
      };

    case 'TOGGLE_CHECKLIST':
      return {
        ...state,
        alerts: state.alerts.map((alert) =>
          alert.id === action.payload.alertId
            ? {
                ...alert,
                status: alert.status === 'new' ? 'processing' : alert.status,
                checklist: alert.checklist.map((item) =>
                  item.id === action.payload.itemId ? {...item, completed: !item.completed} : item,
                ),
              }
            : alert,
        ),
        lastUpdated: now,
      };

    case 'ADD_MOOD':
      return {
        ...state,
        moodLogs: [
          {id: uid('mood'), mood: action.payload.mood, label: action.payload.label, note: action.payload.note, createdAt: timeLabel(now)},
          ...state.moodLogs,
        ].slice(0, 20),
        stabilityScore: Math.max(52, Math.min(96, state.stabilityScore + (action.payload.mood === 'happy' ? 2 : action.payload.mood === 'worried' ? -2 : 1))),
        lastUpdated: now,
      };

    case 'ADD_FOREST_POST':
      return {
        ...state,
        forestPosts: [
          {id: action.payload.id, content: action.payload.content, type: action.payload.type, likes: 0, createdAt: timeLabel(now)},
          ...state.forestPosts,
        ].slice(0, 50),
        lastUpdated: now,
      };

    case 'SET_FOREST_POST_REPLY':
      return {
        ...state,
        forestPosts: state.forestPosts.map((post) =>
          post.id === action.payload.id ? {...post, botReply: action.payload.botReply} : post,
        ),
        lastUpdated: now,
      };

    case 'LIKE_FOREST_POST':
      return {
        ...state,
        forestPosts: state.forestPosts.map((post) =>
          post.id === action.payload.id ? {...post, likes: post.likes + 1} : post,
        ),
        lastUpdated: now,
      };

    case 'ADD_SUPPORT_MESSAGE':
      return {
        ...state,
        supportMessages: [
          ...state.supportMessages,
          {id: uid('msg'), role: action.payload.role, content: action.payload.content, createdAt: now},
        ].slice(-30),
        lastUpdated: now,
      };

    case 'DEPLOY_INTERVENTION':
      return {
        ...state,
        interventions: [
          {
            id: uid('int'),
            title: 'AI 關懷小隊已佈署',
            description: '已建立老師提醒、節點觀察與安心角落三段式流程，先關心、再紀錄、必要時轉介。',
            status: 'running' as Intervention['status'],
            area: action.payload.area,
            updatedAt: timeLabel(now),
          },
          ...state.interventions,
        ].slice(0, 50),
        alerts: state.alerts.map((alert) =>
          action.payload.area.trim() && (alert.location.includes(action.payload.area) || action.payload.area === '全校')
            ? {...alert, status: alert.status === 'new' ? 'processing' : alert.status}
            : alert,
        ),
        lastUpdated: now,
      };

    case 'RESTART_NODE':
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === action.payload.id
            ? {...node, status: 'online', latencyMs: 10, load: 24, signal: 94, lastEvent: '已由本機模式重新連線'}
            : node,
        ),
        lastUpdated: now,
      };

    case 'RECORD_HARDWARE_EVENT':
      return {
        ...state,
        hardwareEvents: [
          {
            id: uid('hw'),
            command: action.payload.command,
            source: action.payload.source,
            status: action.payload.status,
            message: action.payload.message,
            createdAt: timeLabel(now),
          },
          ...state.hardwareEvents,
        ].slice(0, 20),
        lastUpdated: now,
      };

    case 'RECORD_ACOUSTIC_SIGNAL': {
      const attention = action.payload.level === 'elevated';
      return {
        ...state,
        acousticSignals: [
          {
            id: uid('sound'),
            source: action.payload.source,
            location: action.payload.location,
            level: action.payload.level,
            volumeIndex: action.payload.volumeIndex,
            volatility: action.payload.volatility,
            summary: action.payload.summary,
            createdAt: timeLabel(now),
          },
          ...state.acousticSignals,
        ].slice(0, 20),
        nodes: state.nodes.map((node) =>
          node.id === 'node-hall'
            ? {
                ...node,
                status: attention ? 'attention' : node.status === 'offline' ? 'offline' : 'online',
                load: Math.max(node.load, Math.min(96, action.payload.volumeIndex)),
                lastEvent: `本機聲量分析：${action.payload.summary}`,
              }
            : node,
        ),
        lastUpdated: now,
      };
    }

    case 'CREATE_ACOUSTIC_ALERT':
      return {
        ...state,
        alerts: [
          {
            id: uid('alert-sound'),
            studentAlias: '場域訊號',
            className: '匿名場域',
            location: action.payload.location,
            time: timeLabel(now),
            type: '環境聲量提醒',
            description: `本機麥克風只做即時音量與波動運算，未儲存原始聲音。音量指標 ${action.payload.volumeIndex}、波動 ${action.payload.volatility}。${action.payload.summary}`,
            riskLevel: acousticRisk(action.payload.level),
            category: '環境聲量',
            status: 'new' as AlertStatus,
            checklist: [
              {id: uid('sound-check-observe'), text: '由值週老師到場觀察，不公開點名', completed: false},
              {id: uid('sound-check-verify'), text: '確認是否只是正常下課活動或社團練習', completed: false},
              {id: uid('sound-check-escalate'), text: '若伴隨求助按鈕或學生回報，再轉入導師關懷流程', completed: false},
            ],
          },
          ...state.alerts,
        ].slice(0, 50),
        lastUpdated: now,
      };

    case 'CREATE_PROACTIVE_ALERT':
      return {
        ...state,
        alerts: [
          {
            id: uid('alert-proactive'),
            studentAlias: 'AI 主動巡查',
            className: '多來源匿名訊號',
            location: action.payload.location,
            time: timeLabel(now),
            type: action.payload.title,
            description: `${action.payload.description} 主動巡查分數：${action.payload.score}。`,
            riskLevel: action.payload.riskLevel,
            category: '多來源融合',
            status: 'new' as AlertStatus,
            checklist: [
              {id: uid('proactive-check-1'), text: '先查看近期心情簽到、聲量與節點紀錄', completed: false},
              {id: uid('proactive-check-2'), text: '由導師或值週老師低壓巡查，不公開點名', completed: false},
              {id: uid('proactive-check-3'), text: '若學生主動求助，再啟動語音/聊天關懷分析', completed: false},
            ],
          },
          ...state.alerts,
        ].slice(0, 50),
        lastUpdated: now,
      };

    case 'CREATE_CONTEXT_ALERT':
      return {
        ...state,
        alerts: [
          {
            id: uid('alert-context'),
            studentAlias: cleanStoredText(action.payload.studentAlias, '場域事件'),
            className: cleanStoredText(action.payload.className, '匿名場域'),
            location: cleanStoredText(action.payload.location, '校園區域'),
            time: timeLabel(now),
            type: cleanStoredText(action.payload.type, '待處理提醒'),
            description: cleanStoredText(action.payload.description, '已建立事件提醒，請依現場狀況確認。'),
            riskLevel: action.payload.riskLevel,
            category: cleanStoredText(action.payload.category, '校園事件'),
            status: 'new' as AlertStatus,
            checklist: [
              {id: uid('context-check-1'), text: '先派機器人或值週老師到場確認', completed: false},
              {id: uid('context-check-2'), text: '確認是否需要導師或輔導室接手', completed: false},
              {id: uid('context-check-3'), text: '處理後回填觀察紀錄並關閉提醒', completed: false},
            ],
          },
          ...state.alerts,
        ].slice(0, 50),
        lastUpdated: now,
      };

    case 'DISPATCH_ROBOT':
      return {
        ...state,
        robotMissions: [
          {
            id: uid('mission'),
            zoneName: action.payload.zoneName,
            riskScore: action.payload.riskScore,
            status: 'dispatching' as const,
            command: action.payload.command,
            createdAt: timeLabel(now),
          },
          ...state.robotMissions,
        ].slice(0, 20),
        interventions: [
          {
            id: uid('int'),
            title: '機器人已派遣',
            description: `已指派機器人前往 ${action.payload.zoneName}，先做燈號/語音提示並通知老師到場確認。`,
            status: 'running' as Intervention['status'],
            area: action.payload.zoneName,
            updatedAt: timeLabel(now),
          },
          ...state.interventions,
        ].slice(0, 50),
        lastUpdated: now,
      };

    case 'UPDATE_ROBOT_MISSION_STATUS': {
      let updated = false;
      return {
        ...state,
        robotMissions: state.robotMissions.map((mission) => {
          if (updated || mission.zoneName !== action.payload.zoneName || mission.status === 'completed') {
            return mission;
          }
          updated = true;
          return {...mission, status: action.payload.status};
        }),
        lastUpdated: now,
      };
    }

    case 'RESTORE_DEMO_STATE':
      return {
        ...normalizeGuardianState(action.payload.state),
        lastUpdated: now,
      };

    case 'RESET_DEMO':
      return createInitialGuardianState();

    default:
      return state;
  }
}

export function loadGuardianState(): GuardianState {
  if (typeof window === 'undefined') return createInitialGuardianState();
  try {
    const raw = window.localStorage.getItem(GUARDIAN_STORAGE_KEY);
    if (!raw) return createInitialGuardianState();
    const normalized = normalizeGuardianState(JSON.parse(raw));
    window.localStorage.setItem(GUARDIAN_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    const initial = createInitialGuardianState();
    window.localStorage.setItem(GUARDIAN_STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
}

export function persistGuardianState(state: GuardianState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GUARDIAN_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // QuotaExceededError or storage disabled — state lives in memory only
  }
}

export function normalizeGuardianState(input: unknown): GuardianState {
  const fallback = createInitialGuardianState();
  if (!input || typeof input !== 'object') return fallback;

  const parsed = input as Partial<GuardianState>;
  const normalizeList = <T>(value: unknown, fallbackItems: T[], normalize: (item: unknown, fallbackItem: T, index: number) => T | null) => {
    if (!Array.isArray(value)) return fallbackItems;
    const items = value
      .map((item, index) => normalize(item, fallbackItems[index % fallbackItems.length], index))
      .filter((item): item is T => Boolean(item));
    return items.length > 0 ? items : fallbackItems;
  };

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;
  const text = cleanStoredText;
  const optionalText = (value: unknown) =>
    typeof value === 'string' && value.trim() && !hasMojibake(value) ? value.trim() : undefined;
  const number = (value: unknown, fallbackNumber: number, min = 0, max = 100) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallbackNumber;

  const normalizeAlert = (item: unknown, fallbackAlert: GuardianAlert): GuardianAlert | null => {
    if (!isRecord(item)) return null;
    const checklist = Array.isArray(item.checklist)
      ? item.checklist
          .filter(isRecord)
          .map((entry, index) => ({
            id: text(entry.id, fallbackAlert.checklist[index % fallbackAlert.checklist.length]?.id ?? `check-${index}`),
            text: text(entry.text, fallbackAlert.checklist[index % fallbackAlert.checklist.length]?.text ?? '安排老師關懷確認'),
            completed: typeof entry.completed === 'boolean' ? entry.completed : false,
          }))
      : fallbackAlert.checklist;
    return {
      id: text(item.id, fallbackAlert.id),
      studentAlias: text(item.studentAlias, fallbackAlert.studentAlias),
      className: text(item.className, fallbackAlert.className),
      location: text(item.location, fallbackAlert.location),
      time: text(item.time, fallbackAlert.time),
      type: text(item.type, fallbackAlert.type),
      description: text(item.description, fallbackAlert.description),
      riskLevel: item.riskLevel === 'high' || item.riskLevel === 'medium' || item.riskLevel === 'low' ? item.riskLevel : fallbackAlert.riskLevel,
      category: text(item.category, fallbackAlert.category),
      status: item.status === 'new' || item.status === 'processing' || item.status === 'resolved' ? item.status : fallbackAlert.status,
      checklist: checklist.length > 0 ? checklist : fallbackAlert.checklist,
    };
  };

  const normalizeNode = (item: unknown, fallbackNode: GuardianNode): GuardianNode | null => {
    if (!isRecord(item)) return null;
    return {
      id: text(item.id, fallbackNode.id),
      name: text(item.name, fallbackNode.name),
      location: text(item.location, fallbackNode.location),
      status: item.status === 'online' || item.status === 'attention' || item.status === 'offline' ? item.status : fallbackNode.status,
      latencyMs: number(item.latencyMs, fallbackNode.latencyMs, 0, 999),
      load: number(item.load, fallbackNode.load),
      signal: number(item.signal, fallbackNode.signal),
      lastEvent: text(item.lastEvent, fallbackNode.lastEvent),
    };
  };

  const normalizeMood = (item: unknown, fallbackMood: GuardianState['moodLogs'][number]) => {
    if (!isRecord(item)) return null;
    return {
      id: text(item.id, fallbackMood.id),
      mood: item.mood === 'happy' || item.mood === 'steady' || item.mood === 'tired' || item.mood === 'worried' ? item.mood : fallbackMood.mood,
      label: text(item.label, fallbackMood.label),
      note: text(item.note, fallbackMood.note),
      createdAt: text(item.createdAt, fallbackMood.createdAt),
    };
  };

  const normalizeMessage = (item: unknown, fallbackMessage: SupportMessage) => {
    if (!isRecord(item)) return null;
    return {
      id: text(item.id, fallbackMessage.id),
      role: item.role === 'student' || item.role === 'guardian' ? item.role : fallbackMessage.role,
      content: text(item.content, fallbackMessage.content),
      createdAt: text(item.createdAt, fallbackMessage.createdAt),
    };
  };

  const normalizePost = (item: unknown, fallbackPost: ForestPost) => {
    if (!isRecord(item)) return null;
    return {
      id: text(item.id, fallbackPost.id),
      content: text(item.content, fallbackPost.content),
      type: item.type === 'thought' || item.type === 'gratitude' || item.type === 'support' ? item.type : fallbackPost.type,
      likes: number(item.likes, fallbackPost.likes, 0, 9999),
      createdAt: text(item.createdAt, fallbackPost.createdAt),
      botReply: optionalText(item.botReply),
    };
  };

  const normalizeIntervention = (item: unknown, fallbackIntervention: Intervention) => {
    if (!isRecord(item)) return null;
    return {
      id: text(item.id, fallbackIntervention.id),
      title: text(item.title, fallbackIntervention.title),
      description: text(item.description, fallbackIntervention.description),
      status: item.status === 'planned' || item.status === 'running' || item.status === 'completed' ? item.status : fallbackIntervention.status,
      area: text(item.area, fallbackIntervention.area),
      updatedAt: text(item.updatedAt, fallbackIntervention.updatedAt),
    };
  };

  const normalizeHardwareEvent = (item: unknown, fallbackEvent: HardwareEvent) => {
    if (!isRecord(item)) return null;
    return {
      id: text(item.id, fallbackEvent.id),
      command: text(item.command, fallbackEvent.command),
      source: text(item.source, fallbackEvent.source),
      status: item.status === 'sent' || item.status === 'fallback' ? item.status : fallbackEvent.status,
      message: text(item.message, fallbackEvent.message),
      createdAt: text(item.createdAt, fallbackEvent.createdAt),
    };
  };

  const normalizeAcousticSignal = (item: unknown, fallbackSignal: AcousticSignal) => {
    if (!isRecord(item)) return null;
    return {
      id: text(item.id, fallbackSignal.id),
      source: item.source === 'microphone' || item.source === 'demo' ? item.source : fallbackSignal.source,
      location: text(item.location, fallbackSignal.location),
      level: item.level === 'calm' || item.level === 'active' || item.level === 'elevated' ? item.level : fallbackSignal.level,
      volumeIndex: number(item.volumeIndex, fallbackSignal.volumeIndex),
      volatility: number(item.volatility, fallbackSignal.volatility),
      summary: text(item.summary, fallbackSignal.summary),
      createdAt: text(item.createdAt, fallbackSignal.createdAt),
    };
  };

  const normalizeRobotMission = (item: unknown, fallbackMission: RobotMission): RobotMission | null => {
    if (!isRecord(item)) return null;
    return {
      id: text(item.id, fallbackMission.id),
      zoneName: text(item.zoneName, fallbackMission.zoneName),
      riskScore: number(item.riskScore, fallbackMission.riskScore),
      status: item.status === 'dispatching' || item.status === 'arrived' || item.status === 'completed' ? item.status : fallbackMission.status,
      command: text(item.command, fallbackMission.command),
      createdAt: text(item.createdAt, fallbackMission.createdAt),
    };
  };

  const normalizedAlerts = Array.isArray(parsed.alerts)
    ? parsed.alerts
        .map((item, index) => normalizeAlert(item, alerts[index % alerts.length] ?? alerts[0]))
        .filter((item): item is GuardianAlert => Boolean(item))
    : fallback.alerts;

  return {
    ...fallback,
    ...parsed,
    stabilityScore: number(parsed.stabilityScore, fallback.stabilityScore),
    teacherWellbeingScore: number(parsed.teacherWellbeingScore, fallback.teacherWellbeingScore),
    privacyMode: typeof parsed.privacyMode === 'boolean' ? parsed.privacyMode : true,
    alerts: normalizedAlerts.slice(0, 50),
    nodes: normalizeList(parsed.nodes, fallback.nodes, normalizeNode).slice(0, 20),
    moodLogs: normalizeList(parsed.moodLogs, fallback.moodLogs, normalizeMood).slice(0, 20),
    supportMessages: normalizeList(parsed.supportMessages, fallback.supportMessages, normalizeMessage).slice(-30),
    forestPosts: normalizeList(parsed.forestPosts, fallback.forestPosts, normalizePost).slice(0, 50),
    interventions: normalizeList(parsed.interventions, fallback.interventions, normalizeIntervention).slice(0, 50),
    hardwareEvents: normalizeList(parsed.hardwareEvents, fallback.hardwareEvents, normalizeHardwareEvent).slice(0, 20),
    acousticSignals: normalizeList(parsed.acousticSignals, fallback.acousticSignals, normalizeAcousticSignal).slice(0, 20),
    robotMissions: normalizeList(parsed.robotMissions, fallback.robotMissions, normalizeRobotMission).slice(0, 20),
    lastUpdated: typeof parsed.lastUpdated === 'string' ? parsed.lastUpdated : fallback.lastUpdated,
  };
}

function acousticRisk(level: AcousticLevel): RiskLevel {
  if (level === 'elevated') return 'medium';
  if (level === 'active') return 'low';
  return 'low';
}
