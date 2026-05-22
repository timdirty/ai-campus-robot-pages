import {useCallback, useEffect, useMemo, useReducer, useRef, useState} from 'react';
import {TourProvider} from './components/tour/TourProvider';
import {TourOverlay} from './components/tour/TourOverlay';
import {useProxyHealth} from './hooks/useProxyHealth';
import {useHardwareSocket} from './hooks/useHardwareSocket';
import {HardwareStatusBanner} from './components/HardwareStatusBanner';
import {CommandFeedbackToast} from './components/CommandFeedbackToast';
import type {Dispatch, ReactNode} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {
  Bell,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Droplets,
  ExternalLink,
  HeartHandshake,
  Leaf,
  Lock,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Radar,
  RefreshCw,
  Send,
  ShieldCheck,
  Smile,
  Smartphone,
  Sun,
  Thermometer,
  Type,
  Volume2,
  Wifi,
  WifiOff,
  QrCode,
  Settings,
  X,
} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {AcousticSignal, DetectedPort, GuardianAlert, GuardianState, MoodType, RiskLevel, ZoneSensorReading} from './types';
import {guardianReducer, loadGuardianState, normalizeGuardianState, persistGuardianState} from './state/guardianState';
import {analyzeAcousticFrame, describeAcousticSignal} from './services/acousticGuardian';
import {generateSupportReply} from './services/localGuardianAi';
import {analyzeEmotionTypography} from './services/emotionTypography';
import {analyzePrivacyFrame, VisualPrivacyResult} from './services/visualPrivacyGuardian';
import {evaluateProactiveGuardianState, ProactiveInsight} from './services/proactiveGuardian';
import {buildSchoolZoneStatuses, createDemoZoneSensorReadings, SchoolZoneStatus} from './services/schoolSpaces';
import {assignSensorPort, evaluateCampusEvent, fetchBridgeHealth, fetchDrivePorts, fetchRobotDisplayClientCount, fetchRobotDisplayPairingInfo, fetchRobotDisplayStatus, fetchRobotEmotionEvents, fetchSensorPorts, fetchZoneInsight, fetchZoneSensors, pushGuardianSnapshot, pushRobotAssignment, pushRobotEmotionEvent, sendGuardianDriveCommand, sendGuardianHardwareCommand, type RobotDisplayClient, type RobotEmotionEvent, type ZoneInsightResponse} from './services/hardwareBridge';
import {AlertDetail, AlertRow, MetricCard, NodeRow, RiskPill} from './components/guardianUi';
import {SensorSetupModal} from './components/SensorSetupModal';
import {BridgeStatusPill} from './components/GuardianControlPanel';

type ActivePanel = 'alerts' | 'sensing' | 'care' | null;
const STATIC_DEMO_APP = ((import.meta as unknown as {env?: Record<string, string>}).env?.VITE_STATIC_DEMO) === '1';
const STATIC_DEMO_CHANNEL = 'app3-static-demo-sync';
const STATIC_EMOTION_EVENT_KEY = 'app3:static-demo:emotion-event';
type RobotDispatchFeedback = {zoneId: string; zoneName: string; stage: '指令送出' | '前往現場' | '老師確認'; createdAt: number; missionId: string} | null;
type RobotDispatchStage = NonNullable<RobotDispatchFeedback>['stage'];
type ZoneInsightDialogState = {zone: SchoolZoneStatus; loading: boolean; result: ZoneInsightResponse | null; error?: string} | null;
type ZoneInsightAssessment = ZoneInsightResponse & {updatedAt: number};
type RobotRoutePoint = {zoneId: string; name: string; location: string};
type DispatchConfirmState = {zone: SchoolZoneStatus; reason: string; createdAt: number} | null;
type ManualEventResult = {zoneName: string; riskLevel: Exclude<RiskLevel, 'low'>; statusLabel: string; summary: string; source: string; nextStep: string; createdAt: number} | null;
type RobotTravelState = {
  from: RobotRoutePoint;
  to: RobotRoutePoint;
  riskLevel: RiskLevel;
  statusLabel: string;
  startedAt: number;
  durationMs: number;
} | null;

interface CommandCenterViewModel {
  zones: SchoolZoneStatus[];
  highestZone: SchoolZoneStatus;
  dispatchableZones: SchoolZoneStatus[];
  proactiveInsight: ProactiveInsight;
  openAlerts: GuardianAlert[];
  highPriorityCount: number;
  activeRobotCount: number;
  campusHealthLabel: string;
  signalSummary: Array<{label: string; value: string; tone: 'teal' | 'rose' | 'amber' | 'emerald'}>;
}

function mapToRobotEmotion(mood: MoodType | undefined, riskLevel: string, robotActive: boolean): string {
  if (robotActive) return 'focused';
  if (mood === 'happy') return 'happy';
  if (mood === 'steady') return 'calm';
  if (mood === 'tired') return 'sad';
  if (mood === 'worried') return riskLevel === 'high' ? 'stressed' : 'anxious';
  if (riskLevel === 'high') return 'stressed';
  if (riskLevel === 'medium') return 'anxious';
  return 'happy';
}

const moodOptions: Array<{mood: MoodType; label: string; note: string; tone: string}> = [
  {mood: 'happy', label: '開心', note: '今天有一點亮亮的事', tone: 'border-emerald-300 bg-emerald-50 text-emerald-800'},
  {mood: 'steady', label: '還可以', note: '狀態普通，能慢慢做', tone: 'border-sky-300 bg-sky-50 text-sky-800'},
  {mood: 'tired', label: '有點累', note: '需要短暫休息一下', tone: 'border-amber-300 bg-amber-50 text-amber-800'},
  {mood: 'worried', label: '有點擔心', note: '想找人一起想辦法', tone: 'border-rose-300 bg-rose-50 text-rose-800'},
];

const panelNav: Array<{id: Exclude<ActivePanel, null>; label: string; icon: LucideIcon}> = [
  {id: 'alerts', label: '預警', icon: Bell},
  {id: 'sensing', label: '感知', icon: Radar},
  {id: 'care', label: '照護', icon: Leaf},
];

const defaultAcoustic = describeAcousticSignal(0, 0);
const manualEventTemplates = [
  {label: '操場衝突', zoneId: 'zone-field', text: '操場有兩名學生發生推擠爭執，旁邊同學圍觀，現場情緒升高。'},
  {label: '穿堂哭泣', zoneId: 'zone-hall', text: '穿堂有學生蹲坐哭泣，不願回教室，需要低壓關懷確認。'},
  {label: '圖書館低落', zoneId: 'zone-library', text: '圖書館角落有學生長時間獨處且拒絕回應，同學表示他今天狀態低落。'},
];
const robotDispatchSteps: RobotDispatchStage[] = ['指令送出', '前往現場', '老師確認'];
const ROBOT_TRAVEL_MS = 5000;
const ROBOT_HOME_POINT: RobotRoutePoint = {zoneId: 'robot-home', name: '巡邏底盤', location: '中控待命點'};

function zoneToRobotRoutePoint(zone: SchoolZoneStatus): RobotRoutePoint {
  return {zoneId: zone.id, name: zone.name, location: zone.location};
}

function getRobotStageIndex(stage: RobotDispatchStage | undefined) {
  return stage ? Math.max(0, robotDispatchSteps.indexOf(stage)) : -1;
}

function getRobotStageMeta(stage: RobotDispatchStage | undefined) {
  if (stage === '指令送出') return {label: '送出', detail: '建立任務與備援紀錄', eta: '00:08'};
  if (stage === '前往現場') return {label: '移動', detail: '機器人沿巡邏線前往', eta: '00:04'};
  if (stage === '老師確認') return {label: '確認', detail: '老師收到低壓關懷提示', eta: '完成'};
  return {label: '待命', detail: '選取風險區後可派遣', eta: '--'};
}

function getRobotStageProgress(stage: RobotDispatchStage | undefined) {
  if (stage === '指令送出') return 34;
  if (stage === '前往現場') return 72;
  if (stage === '老師確認') return 100;
  return 0;
}

function getRiskStatusLabel(level: string) {
  if (level === 'high') return '高風險';
  if (level === 'medium') return '注意';
  return '安全';
}

function normalizeRiskLevel(level: unknown): RiskLevel {
  return level === 'high' || level === 'medium' || level === 'low' ? level : 'medium';
}

function hasMojibake(text: unknown): boolean {
  return typeof text === 'string' && /[�\uE000-\uF8FF]|ï¿½|Ã|Â|[撌瘜隢璈鈭嚗蝘蝣摰雿霈]/.test(text);
}

function cleanDisplayText(text: unknown, fallback: string): string {
  return typeof text === 'string' && text.trim() && !hasMojibake(text) ? text : fallback;
}

function getRiskStatusTone(level: string) {
  if (level === 'high') {
    return {
      dot: 'bg-rose-500',
      text: 'text-rose-700',
      soft: 'bg-rose-50 text-rose-700 ring-rose-200',
      panel: 'border-rose-200 bg-rose-50',
      bar: 'bg-rose-500',
    };
  }
  if (level === 'medium') {
    return {
      dot: 'bg-amber-500',
      text: 'text-amber-700',
      soft: 'bg-amber-50 text-amber-700 ring-amber-200',
      panel: 'border-amber-200 bg-amber-50',
      bar: 'bg-amber-500',
    };
  }
  return {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    soft: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    panel: 'border-emerald-200 bg-emerald-50',
    bar: 'bg-emerald-500',
  };
}

const TEACHER_HANDOFF_TONE = {
  dot: 'bg-violet-500',
  text: 'text-violet-700',
  soft: 'bg-violet-50 text-violet-700 ring-violet-200',
  panel: 'border-violet-200 bg-violet-50',
  bar: 'bg-violet-500',
};

function getRiskStatusColor(level: string, teacherCalled = false) {
  if (teacherCalled) return '#8b5cf6';
  if (level === 'high') return '#f43f5e';
  if (level === 'medium') return '#f59e0b';
  return '#10b981';
}

function isZoneIdle(zone: SchoolZoneStatus) {
  return !zone.sensor;
}

function getZoneStatusLabel(zone: SchoolZoneStatus, teacherCalled = false) {
  if (teacherCalled) return '老師接手';
  if (isZoneIdle(zone)) return '待機';
  return getRiskStatusLabel(zone.riskLevel);
}

function getZoneSensorLabel(zone: SchoolZoneStatus) {
  if (isZoneIdle(zone)) return '未指派';
  return zone.sensor?.connected ? '在線' : '離線';
}

function getZoneTone(zone: SchoolZoneStatus, teacherCalled = false) {
  if (teacherCalled) return TEACHER_HANDOFF_TONE;
  if (!isZoneIdle(zone)) return getRiskStatusTone(zone.riskLevel);
  return {
    dot: 'bg-slate-400',
    text: 'text-slate-600',
    soft: 'bg-slate-50 text-slate-600 ring-slate-200',
    panel: 'border-slate-200 bg-slate-50',
    bar: 'bg-slate-300',
  };
}

type SignalTone = 'teal' | 'rose' | 'amber' | 'emerald' | 'slate' | 'violet';

function getZoneSignalTone(zone: SchoolZoneStatus, teacherCalled = false): SignalTone {
  if (teacherCalled) return 'violet';
  if (isZoneIdle(zone)) return 'slate';
  if (zone.riskLevel === 'high') return 'rose';
  if (zone.riskLevel === 'medium') return 'amber';
  return 'emerald';
}

function getZoneAccentBar(zone: SchoolZoneStatus, teacherCalled = false) {
  if (teacherCalled) return 'bg-linear-to-r from-violet-400 to-violet-600';
  if (isZoneIdle(zone)) return 'bg-slate-300';
  if (zone.riskLevel === 'high') return 'bg-linear-to-r from-rose-400 to-rose-600';
  if (zone.riskLevel === 'medium') return 'bg-linear-to-r from-amber-300 to-amber-500';
  return 'bg-linear-to-r from-teal-300 to-teal-500';
}

const CRISIS_KEYWORDS_UI = ['不想活', '想死', '自殺', '消失', '傷害自己', '活不下去', '尋死', '割腕', '跳樓', '喝農藥', '結束生命', '不想存在'];
const MISSION_STEPS = ['送出', '抵達', '回報'] as const;

function isCrisisMessage(text: string): boolean {
  return CRISIS_KEYWORDS_UI.some((k) => text.includes(k));
}

export default function App() {
  return (
    <TourProvider>
      <AppContent />
      <TourOverlay />
    </TourProvider>
  );
}

function AppContent() {
  const [state, dispatch] = useReducer(guardianReducer, undefined, loadGuardianState);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<GuardianAlert | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedMood, setSelectedMood] = useState<MoodType>('steady');
  const [message, setMessage] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [robotFeedback, setRobotFeedback] = useState<RobotDispatchFeedback>(null);
  const [robotDisplayZoneId, setRobotDisplayZoneId] = useState<string | null>(null);
  const [robotTravel, setRobotTravel] = useState<RobotTravelState>(null);
  const [dispatchConfirm, setDispatchConfirm] = useState<DispatchConfirmState>(null);
  const [teacherCalledZones, setTeacherCalledZones] = useState<Record<string, boolean>>({});
  const [zoneCooldowns, setZoneCooldowns] = useState<Record<string, number>>({});
  const [cooldownNow, setCooldownNow] = useState(Date.now());
  const [zoneInsightDialog, setZoneInsightDialog] = useState<ZoneInsightDialogState>(null);
  const [zoneAssessments, setZoneAssessments] = useState<Record<string, ZoneInsightAssessment>>({});
  const [manualEventText, setManualEventText] = useState('');
  const [manualEventZoneId, setManualEventZoneId] = useState('zone-field');
  const [manualEventBusy, setManualEventBusy] = useState(false);
  const [manualEventResult, setManualEventResult] = useState<ManualEventResult>(null);
  const [micActive, setMicActive] = useState(false);
  const [micStarting, setMicStarting] = useState(false);
  const [micError, setMicError] = useState('');
  const [acousticLocation, setAcousticLocation] = useState('穿堂');
  const [currentAcoustic, setCurrentAcoustic] = useState(defaultAcoustic);
  const [zoneSensors, setZoneSensors] = useState<ZoneSensorReading[]>([]);
  const [detectedPorts, setDetectedPorts] = useState<DetectedPort[]>([]);
  const [drivePorts, setDrivePorts] = useState<DetectedPort[]>([]);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [robotDisplayClientCount, setRobotDisplayClientCount] = useState(0);
  const [showFrontendPairing, setShowFrontendPairing] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const robotTimersRef = useRef<number[]>([]);
  const robotTravelTimerRef = useRef<number | null>(null);
  const robotTravelRef = useRef<RobotTravelState>(null);
  const robotLocationRef = useRef<SchoolZoneStatus | null>(null);
  const zoneStatusBusyRef = useRef(false);
  const baseZonesRef = useRef<SchoolZoneStatus[]>([]);
  const latestZonesRef = useRef<SchoolZoneStatus[]>([]);
  const zoneActionCooldownRef = useRef<Record<string, number>>({});
  const teacherCalledZoneRef = useRef<Record<string, boolean>>({});
  const robotEmotionCursorRef = useRef<string>('');
  const robotEmotionSeenRef = useRef<Set<string>>(new Set());
  const proxyHealth = useProxyHealth();
  const proxyOnline = proxyHealth.online;
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const hwStatus = useHardwareSocket('http://localhost:3203');
  const volumeHistoryRef = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const baseViewModel = useMemo(() => buildCommandCenterViewModel(state, zoneSensors), [state, zoneSensors]);
  const viewModel = useMemo(() => applyZoneAssessments(baseViewModel, zoneAssessments), [baseViewModel, zoneAssessments]);
  const selectedZone = useMemo(
    () => viewModel.zones.find((zone) => zone.id === selectedZoneId) ?? viewModel.highestZone,
    [viewModel.zones, viewModel.highestZone, selectedZoneId],
  );
  const robotDisplayZone = useMemo(
    () => robotDisplayZoneId ? viewModel.zones.find((zone) => zone.id === robotDisplayZoneId) ?? null : null,
    [robotDisplayZoneId, viewModel.zones],
  );
  const robotMapZone = robotDisplayZone ?? viewModel.highestZone;
  const latestMood = state.moodLogs[0];

  useEffect(() => {
    baseZonesRef.current = baseViewModel.zones;
  }, [baseViewModel.zones]);

  useEffect(() => {
    latestZonesRef.current = viewModel.zones;
  }, [viewModel.zones]);

  useEffect(() => {
    persistGuardianState(state);
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const [online, readings] = await Promise.all([
          fetchBridgeHealth(),
          fetchZoneSensors(),
        ]);
        if (!cancelled) {
          setZoneSensors(readings.some((sensor) => sensor.connected) ? readings : createDemoZoneSensorReadings());
          setBridgeOnline(online);
        }
      } catch {
        // bridge offline — keep last known state
      }
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const [ports, drive] = await Promise.all([
          fetchSensorPorts(),
          fetchDrivePorts(),
        ]);
        if (!cancelled) {
          setDetectedPorts(ports);
          setDrivePorts(drive.ports);
        }
      } catch {
        // keep last known ports on transient error
      }
    };
    poll();
    const timer = setInterval(poll, 12000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const count = await fetchRobotDisplayClientCount();
      if (!cancelled) setRobotDisplayClientCount(count);
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    const timer = window.setInterval(() => setCooldownNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!robotFeedback) return;
    const timer = window.setTimeout(() => setRobotFeedback(null), 5600);
    return () => window.clearTimeout(timer);
  }, [robotFeedback]);

  useEffect(() => () => stopAcousticMonitor(), []);
  useEffect(() => () => { robotTimersRef.current.forEach(clearTimeout); robotTimersRef.current = []; }, []);
  useEffect(() => () => {
    if (robotTravelTimerRef.current) window.clearTimeout(robotTravelTimerRef.current);
  }, []);

  // Hash-based deep-link: guide page chips can link to e.g. ./app3/#sensing
  useEffect(() => {
    const hash = window.location.hash.slice(1) as ActivePanel;
    if (panelNav.find((p) => p.id === hash)) setActivePanel(hash);
  }, []);

  // Keep URL hash in sync with active panel so shared URLs always open correct panel
  useEffect(() => {
    if (activePanel) {
      history.replaceState(null, '', window.location.pathname + '#' + activePanel);
    } else {
      history.replaceState(null, '', window.location.pathname);
    }
  }, [activePanel]);

  // Push real state to robot display (debounced 1500ms to prevent iPad thrashing)
  const snapshotPushRef = useRef<number | null>(null);
  useEffect(() => {
    if (snapshotPushRef.current) clearTimeout(snapshotPushRef.current);
    snapshotPushRef.current = window.setTimeout(() => {
      const insight = viewModel.proactiveInsight;
      const latestMood = state.moodLogs[0];
      const latestAcoustic = state.acousticSignals[0];
      const robotActive = robotDisplayClientCount > 0;
      const stress = Math.min(100, Math.round((insight.score / 10) * 100));
      const stability = Math.max(0, 100 - stress);
      const focus = latestAcoustic?.volumeIndex != null
        ? Math.max(10, Math.min(95, 95 - Math.round(latestAcoustic.volumeIndex * 0.7)))
        : 75;
      const s = insight.signals;
      void pushGuardianSnapshot({
        emotion: mapToRobotEmotion(latestMood?.mood, insight.riskLevel, robotActive),
        stress,
        stability,
        focus,
        fusionScore: insight.score,
        signals: {
          moodScore: s.find((x) => x.label === '心情訊號')?.score ?? 0,
          soundScore: 0,
          nodeScore: s.find((x) => x.label === '節點狀態')?.score ?? 0,
          alertScore: s.find((x) => x.label === '未結提醒')?.score ?? 0,
        },
        riskScore: viewModel.highestZone.riskScore,
        riskLabel: insight.riskLevel === 'high' ? '高風險' : insight.riskLevel === 'medium' ? '中風險' : '低風險',
        moodLabel: latestMood?.label ?? '未簽到',
        robotActive,
      });
    }, 1500);
  }, [
    state.moodLogs,
    state.acousticSignals,
    state.robotMissions,
    state.alerts,
    state.nodes,
    viewModel.proactiveInsight,
    viewModel.highestZone.riskScore,
    viewModel.activeRobotCount,
    robotDisplayClientCount,
  ]);

  useEffect(() => {
    if (!robotDisplayZone) return;
    if (robotTravel) return;
    const liveFeedback = robotFeedback?.zoneId === robotDisplayZone.id ? robotFeedback : null;
    void pushRobotAssignment({
      zoneId: robotDisplayZone.id,
      zoneName: robotDisplayZone.name,
      location: robotDisplayZone.location,
      riskLevel: robotDisplayZone.riskLevel,
      statusLabel: getRiskStatusLabel(robotDisplayZone.riskLevel),
      stage: liveFeedback?.stage ?? '現場待命',
      missionId: liveFeedback?.missionId ?? null,
      active: Boolean(liveFeedback),
      moving: false,
    });
  }, [
    robotDisplayZone?.id,
    robotDisplayZone?.name,
    robotDisplayZone?.location,
    robotDisplayZone?.riskLevel,
    robotFeedback?.zoneId,
    robotFeedback?.stage,
    robotFeedback?.missionId,
    robotTravel,
  ]);

  const showToast = useCallback((text: string) => setToastMessage(text), []);

  const startRobotTravelAfterConfirm = useCallback((zone: SchoolZoneStatus): boolean => {
    if (teacherCalledZoneRef.current[zone.id]) {
      showToast(`${zone.name}老師接手中，等現場回報後才恢復派遣`);
      return false;
    }
    if (robotTravelRef.current) return false;
    setSelectedZoneId(zone.id);
    setRobotDisplayZoneId(zone.id);
    if (robotLocationRef.current?.id === zone.id) return true;

    const travel: NonNullable<RobotTravelState> = {
      from: robotLocationRef.current ? zoneToRobotRoutePoint(robotLocationRef.current) : ROBOT_HOME_POINT,
      to: zoneToRobotRoutePoint(zone),
      riskLevel: zone.riskLevel,
      statusLabel: getRiskStatusLabel(zone.riskLevel),
      startedAt: Date.now(),
      durationMs: ROBOT_TRAVEL_MS,
    };
    const travelStartedAt = new Date(travel.startedAt).toISOString();
    const travelEndsAt = new Date(travel.startedAt + travel.durationMs).toISOString();
    if (robotTravelTimerRef.current) window.clearTimeout(robotTravelTimerRef.current);
    robotTravelRef.current = travel;
    setRobotTravel(travel);
    void pushRobotAssignment({
      zoneId: zone.id,
      zoneName: zone.name,
      location: zone.location,
      riskLevel: zone.riskLevel,
      statusLabel: getRiskStatusLabel(zone.riskLevel),
      stage: '前往現場',
      missionId: null,
      active: true,
      moving: true,
      travelStartedAt,
      travelEndsAt,
      fromZoneId: travel.from.zoneId,
      fromZoneName: travel.from.name,
      fromLocation: travel.from.location,
    });
    void (async () => {
      await sendGuardianDriveCommand('SPEED:110');
      await sendGuardianDriveCommand('PATROL_START');
    })().catch((error) => {
      console.warn('drive dispatch failed', error);
    });
    robotTravelTimerRef.current = window.setTimeout(() => {
      void sendGuardianDriveCommand('STOP').catch(() => {});
      robotLocationRef.current = zone;
      robotTravelRef.current = null;
      setRobotTravel(null);
      robotTravelTimerRef.current = null;
    }, ROBOT_TRAVEL_MS);
    return true;
  }, [showToast]);

  const selectZoneForStatus = useCallback((zone: SchoolZoneStatus): void => {
    setSelectedZoneId(zone.id);
    setManualEventZoneId(zone.id);
  }, []);

  const prepareManualEventForZone = useCallback((zone: SchoolZoneStatus, seedText = '') => {
    setSelectedZoneId(zone.id);
    setManualEventZoneId(zone.id);
    setManualEventResult(null);
    if (seedText || !manualEventText.trim()) {
      setManualEventText(seedText);
    }
    setActivePanel('alerts');
    showToast(`${zone.name} 已帶入手動事件流程`);
  }, [manualEventText, showToast]);

  const recordZoneAssessment = useCallback((zone: SchoolZoneStatus, result: ZoneInsightResponse) => {
    const riskLevel = normalizeRiskLevel(result.riskLevel);
    setZoneAssessments((current) => ({
      ...current,
      [zone.id]: {
        ...result,
        riskLevel,
        statusLabel: getRiskStatusLabel(riskLevel),
        summary: cleanDisplayText(result.summary, zone.summary),
        situations: result.situations?.map((item) => cleanDisplayText(item, '請依現場回報確認狀況。')).filter(Boolean) ?? [],
        suggestions: result.suggestions?.map((item) => cleanDisplayText(item, '請先由老師確認下一步。')).filter(Boolean) ?? [],
        error: cleanDisplayText(result.error, ''),
        updatedAt: Date.now(),
      },
    }));
  }, []);

  const buildZoneInsightPayload = useCallback((zone: SchoolZoneStatus, mode: 'status' | 'detail' = 'detail') => {
    return {
      mode,
      zoneId: zone.id,
      zoneName: zone.name,
      location: zone.location,
      currentStatusLabel: getRiskStatusLabel(zone.riskLevel),
      currentRiskLevel: zone.riskLevel,
      ruleBasedScore: zone.riskScore,
      alertCount: zone.alertCount,
      nodeStatus: zone.nodeStatus,
      sensor: zone.sensor ? {
        temperature: zone.sensor.temp,
        humidity: zone.sensor.hum,
        light: zone.sensor.light,
        status: zone.sensor.connected ? 'online' : 'offline',
      } : undefined,
    };
  }, []);

  const requestZoneInsight = useCallback(async (zone: SchoolZoneStatus, mode: 'status' | 'detail' = 'detail') => {
    const result = await fetchZoneInsight(buildZoneInsightPayload(zone, mode));
    if (mode === 'status') {
      setZoneAssessments((current) => ({
        ...current,
        [zone.id]: {...result, updatedAt: Date.now()},
      }));
    }
    return result;
  }, [buildZoneInsightPayload]);

  const openZoneInsight = useCallback((zone: SchoolZoneStatus) => {
    setSelectedZoneId(zone.id);
    setZoneInsightDialog({zone, loading: true, result: null});
    void requestZoneInsight(zone, 'detail').then((result) => {
      setZoneInsightDialog((current) => current?.zone.id === zone.id ? {...current, loading: false, result} : current);
    }).catch((error) => {
      setZoneInsightDialog((current) => current?.zone.id === zone.id ? {
        ...current,
        loading: false,
        result: null,
        error: error instanceof Error ? error.message : String(error),
      } : current);
    });
  }, [requestZoneInsight]);

  const refreshAllZoneAssessments = useCallback(async (zones: SchoolZoneStatus[], silent = false) => {
    const activeZones = zones.filter((zone) => zone.sensor && (zoneActionCooldownRef.current[zone.id] ?? 0) <= Date.now());
    if (activeZones.length === 0) return;
    await Promise.allSettled(activeZones.map(async (zone) => {
      const result = await fetchZoneInsight(buildZoneInsightPayload(zone, 'status'));
      setZoneAssessments((current) => ({
        ...current,
        [zone.id]: {...result, updatedAt: Date.now()},
      }));
    }));
    if (!silent) showToast('三個區域燈號已依感測器數值重新判讀');
  }, [buildZoneInsightPayload, showToast]);

  const refreshZoneStatuses = useCallback(async () => {
    if (zoneStatusBusyRef.current || baseZonesRef.current.length === 0) return;
    zoneStatusBusyRef.current = true;
    try {
      await refreshAllZoneAssessments(baseZonesRef.current, true);
    } finally {
      zoneStatusBusyRef.current = false;
    }
  }, [refreshAllZoneAssessments]);

  useEffect(() => {
    if (!bridgeOnline) return;
    void refreshZoneStatuses();
    const timer = window.setInterval(() => {
      void refreshZoneStatuses();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [bridgeOnline, refreshZoneStatuses]);

  const sendHardwareCue = useCallback((command: string, source: string) => {
    void sendGuardianHardwareCommand(command, source).then((result) => {
      dispatch({
        type: 'RECORD_HARDWARE_EVENT',
        payload: {command, source, status: result.ok ? 'sent' : 'fallback', message: result.message},
      });
      showToast(result.ok ? `硬體已接收：${command}` : `硬體備援：${result.message}`);
    }).catch(() => {
      showToast('硬體指令發送失敗，使用備援模式');
    });
  }, [showToast]);

  const confirmRobotDispatch = useCallback((zone: SchoolZoneStatus) => {
    if (robotTravelRef.current) {
      showToast('機器人移動中，地圖暫時鎖定');
      return;
    }
    if (!startRobotTravelAfterConfirm(zone)) return;
    if (robotFeedback?.zoneId === zone.id) {
      showToast(`${zone.name} 任務已在進行中`);
      return;
    }
    const createdAt = Date.now();
    robotTimersRef.current.forEach(clearTimeout);
    robotTimersRef.current = [];
    setRobotFeedback({zoneId: zone.id, zoneName: zone.name, stage: '指令送出', createdAt, missionId: `R-${createdAt.toString().slice(-4)}`});
    robotTimersRef.current.push(window.setTimeout(() => {
      setRobotFeedback((current) => current?.createdAt === createdAt ? {...current, stage: '前往現場'} : current);
      dispatch({type: 'UPDATE_ROBOT_MISSION_STATUS', payload: {zoneName: zone.name, status: 'arrived'}});
    }, 1200));
    robotTimersRef.current.push(window.setTimeout(() => {
      setRobotFeedback((current) => current?.createdAt === createdAt ? {...current, stage: '老師確認'} : current);
      dispatch({type: 'UPDATE_ROBOT_MISSION_STATUS', payload: {zoneName: zone.name, status: 'completed'}});
    }, 3200));
    robotTimersRef.current.push(window.setTimeout(() => setRobotFeedback((current) => current?.createdAt === createdAt ? null : current), 7200));
    dispatch({type: 'DISPATCH_ROBOT', payload: {zoneName: zone.name, riskScore: zone.riskScore, command: 'ROBOT_DISPATCH'}});
    sendHardwareCue('CARE_DEPLOYED', `app3:robot:${zone.id}`);
    setDispatchConfirm(null);
    showToast(`已指派機器人前往${zone.name}`);
  }, [robotFeedback, showToast, sendHardwareCue, startRobotTravelAfterConfirm]);

  const dispatchRobotToZone = useCallback((zone: SchoolZoneStatus, reason = '手動派遣') => {
    if (robotTravelRef.current) {
      showToast('機器人移動中，地圖暫時鎖定');
      return;
    }
    if (teacherCalledZoneRef.current[zone.id]) {
      showToast(`${zone.name}老師接手中，等現場回報後才恢復派遣`);
      return;
    }
    if (robotFeedback?.zoneId === zone.id) {
      showToast(`${zone.name} 任務已在進行中`);
      return;
    }
    if (isZoneIdle(zone)) {
      showToast(`${zone.name} 尚未指派感測器，無法派遣`);
      return;
    }
    if (zone.riskLevel === 'low') {
      showToast(`${zone.name} 目前為安全，維持一般巡查`);
      return;
    }
    setSelectedZoneId(zone.id);
    setDispatchConfirm({zone, reason, createdAt: Date.now()});
  }, [robotFeedback, showToast]);

  const submitManualEvent = useCallback(async () => {
    const eventText = manualEventText.trim();
    const zone = viewModel.zones.find((item) => item.id === manualEventZoneId) ?? selectedZone;
    if (!eventText || !zone || manualEventBusy) return;
    setManualEventBusy(true);
    try {
      const result = await evaluateCampusEvent({
        zoneId: zone.id,
        zoneName: zone.name,
        location: zone.location,
        eventText,
        source: 'manual',
      });
      const riskLevel: Exclude<RiskLevel, 'low'> = result.riskLevel === 'high' ? 'high' : 'medium';
      const normalizedResult: ZoneInsightResponse = {
        ...result,
        riskLevel,
        statusLabel: riskLevel === 'high' ? '高風險' : '注意',
        summary: result.summary || eventText,
      };
      dispatch({
        type: 'CREATE_CONTEXT_ALERT',
        payload: {
          location: zone.location,
          type: '手動輸入事件',
          description: `${cleanDisplayText(normalizedResult.summary, `${zone.name}已建立事件提醒。`)} 原始紀錄：${eventText}`,
          riskLevel,
          category: '手動事件',
          studentAlias: '值勤老師回報',
        },
      });
      recordZoneAssessment(zone, normalizedResult);
      setSelectedZoneId(zone.id);
      setManualEventResult({
        zoneName: zone.name,
        riskLevel,
        statusLabel: normalizedResult.statusLabel,
        summary: cleanDisplayText(normalizedResult.summary, `${zone.name}已建立事件提醒，請確認是否需要派遣機器人到場。`),
        source: normalizedResult.source === 'fallback' ? '本機 AI 備援' : '雲端 AI',
        nextStep: '已建立提醒，下一步請確認是否派遣機器人到場。',
        createdAt: Date.now(),
      });
      setManualEventText('');
      setActivePanel('alerts');
      showToast(`已建立${zone.name}事件，請確認是否派遣`);
    } finally {
      setManualEventBusy(false);
    }
  }, [manualEventText, manualEventZoneId, manualEventBusy, viewModel.zones, selectedZone, recordZoneAssessment, showToast]);

  const handleRobotEmotionEvent = useCallback((event: RobotEmotionEvent) => {
    if (robotEmotionSeenRef.current.has(event.id)) return;
    robotEmotionSeenRef.current.add(event.id);
    const zone = viewModel.zones.find((item) => item.id === event.zoneId)
      ?? viewModel.zones.find((item) => event.zoneName.includes(item.name) || event.location.includes(item.name))
      ?? viewModel.zones.find((item) => item.id === 'zone-field')
      ?? viewModel.highestZone;
    if (event.source === 'robot-arrival-prompt' || event.emotion === 'incident_resolved' || event.emotion === 'teacher_called') {
      const cooldownUntil = Date.now() + 15000;
      zoneActionCooldownRef.current[zone.id] = cooldownUntil;
      setZoneCooldowns((current) => ({...current, [zone.id]: cooldownUntil}));
      setCooldownNow(Date.now());
      teacherCalledZoneRef.current[zone.id] = event.emotion === 'teacher_called';
      setTeacherCalledZones((current) => ({...current, [zone.id]: event.emotion === 'teacher_called'}));
      if (event.emotion === 'incident_resolved') {
        recordZoneAssessment(zone, {
          ok: true,
          source: 'robot-arrival-prompt',
          model: null,
          riskLevel: 'low',
          statusLabel: '安全',
          confidence: 92,
          summary: `${zone.name}已由機器人確認事件解除，暫時解除區域警戒。`,
          situations: ['機器人到場後回報事件解除。'],
          suggestions: ['15 秒冷卻後會重新讀取感測器狀態。'],
        });
      } else if (event.emotion === 'teacher_called') {
        const riskLevel: Exclude<RiskLevel, 'low'> = event.riskLevel === 'high' ? 'high' : 'medium';
        recordZoneAssessment(zone, {
          ok: true,
          source: 'robot-arrival-prompt',
          model: null,
          riskLevel,
          statusLabel: '老師接手',
          confidence: 95,
          summary: `${zone.name}已由機器人通報老師接手，暫停本區重複派遣。`,
          situations: ['機器人到場後判定現場仍需真人老師確認。'],
          suggestions: ['請值勤老師或導師到場接手，確認學生與現場安全。'],
        });
      }
      showToast(event.emotion === 'teacher_called'
        ? `${zone.name}已通報老師，暫停本區重複派遣`
        : `${zone.name}已回報解決，15 秒後重新讀取感測器`);
      window.setTimeout(() => {
        if ((zoneActionCooldownRef.current[zone.id] ?? 0) > Date.now()) return;
        delete zoneActionCooldownRef.current[zone.id];
        setZoneCooldowns((current) => {
          const next = {...current};
          delete next[zone.id];
          return next;
        });
        const latestZone = latestZonesRef.current.find((item) => item.id === zone.id);
        if (!latestZone) return;
        if (!teacherCalledZoneRef.current[zone.id]) {
          void (async () => {
            const refreshed = await fetchZoneInsight(buildZoneInsightPayload(latestZone, 'status')).catch(() => null);
            if (refreshed) {
              recordZoneAssessment(latestZone, refreshed);
            }
            const finalRisk = refreshed?.riskLevel === 'high' || refreshed?.riskLevel === 'medium'
              ? refreshed.riskLevel
              : latestZone.riskLevel === 'high' ? 'high' : latestZone.riskLevel === 'medium' ? 'medium' : 'low';
            if (finalRisk === 'low') {
              teacherCalledZoneRef.current[zone.id] = false;
              setTeacherCalledZones((current) => ({...current, [zone.id]: false}));
              return;
            }
            const riskLevel: Exclude<RiskLevel, 'low'> = finalRisk === 'high' ? 'high' : 'medium';
            const summary = `${latestZone.name}冷卻 15 秒後仍為${getRiskStatusLabel(riskLevel)}，請由老師手動確認是否通知師長接手。`;
            recordZoneAssessment(latestZone, {
              ok: true,
              source: 'command-center-cooldown',
              model: null,
              riskLevel,
              statusLabel: getRiskStatusLabel(riskLevel),
              confidence: riskLevel === 'high' ? 90 : 72,
              summary,
              situations: ['機器人回報後冷卻期結束，感測器仍顯示需要注意。'],
              suggestions: ['請在預警處理面板中手動選擇是否通知老師接手。'],
            });
            dispatch({
              type: 'CREATE_CONTEXT_ALERT',
              payload: {
                location: latestZone.location,
                type: '建議老師確認',
                description: summary,
                riskLevel,
                category: '感測器異常',
                studentAlias: '機器人回報',
              },
            });
            showToast(`${latestZone.name}仍需老師確認，已建立提醒`);
          })();
        }
      }, 15200);
      return;
    }
    const riskLevel: Exclude<RiskLevel, 'low'> = event.riskLevel === 'high' ? 'high' : 'medium';
    const statusLabel = riskLevel === 'high' ? '高風險' : '注意';
    const summary = `${event.zoneName || zone.name}偵測到「${event.emotionLabel || event.emotion}」情緒，建議老師確認現場。`;
    dispatch({
      type: 'CREATE_CONTEXT_ALERT',
      payload: {
        location: zone.location,
        type: '機器人情緒判斷',
        description: event.description || summary,
        riskLevel,
        category: '情緒判斷',
        studentAlias: '機器人前端',
      },
    });
    recordZoneAssessment(zone, {
      ok: true,
      source: event.source || 'robot-display',
      model: null,
      riskLevel,
      statusLabel,
      confidence: riskLevel === 'high' ? 88 : 66,
      summary,
      situations: [event.description || summary],
      suggestions: ['請機器人或值勤老師先前往確認，保持低壓關懷。'],
    });
    showToast(`機器人回報${zone.name}情緒事件：${statusLabel}`);
  }, [viewModel.zones, viewModel.highestZone, recordZoneAssessment, showToast]);

  useEffect(() => {
    if (!STATIC_DEMO_APP) return;
    const consume = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      const event = value as Partial<RobotEmotionEvent> & {type?: string};
      if (event.type !== 'robot_emotion_event') return;
      if (typeof event.id !== 'string' || typeof event.emotion !== 'string') return;
      handleRobotEmotionEvent(event as RobotEmotionEvent);
    };
    try {
      const raw = localStorage.getItem(STATIC_EMOTION_EVENT_KEY);
      if (raw) consume(JSON.parse(raw));
    } catch {
      // Stored demo events are optional.
    }
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(STATIC_DEMO_CHANNEL);
      channel.onmessage = (event) => consume(event.data);
    } catch {
      // Older browsers can still use the polling fallback below.
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STATIC_EMOTION_EVENT_KEY || !event.newValue) return;
      try { consume(JSON.parse(event.newValue)); } catch {}
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      channel?.close();
    };
  }, [handleRobotEmotionEvent]);

  useEffect(() => {
    if (!bridgeOnline) return;
    let stopped = false;
    const pull = async () => {
      const events = await fetchRobotEmotionEvents(robotEmotionCursorRef.current || undefined);
      if (stopped || events.length === 0) return;
      const sorted = [...events].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
      for (const event of sorted) {
        handleRobotEmotionEvent(event);
        if (!robotEmotionCursorRef.current || Date.parse(event.updatedAt) > Date.parse(robotEmotionCursorRef.current)) {
          robotEmotionCursorRef.current = event.updatedAt;
        }
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 1800);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [bridgeOnline, handleRobotEmotionEvent]);

  useEffect(() => {
    for (const zone of viewModel.zones) {
      if (zone.riskLevel === 'low' && !teacherCalledZoneRef.current[zone.id]) {
        if (teacherCalledZones[zone.id]) {
          setTeacherCalledZones((current) => ({...current, [zone.id]: false}));
        }
      }
    }
  }, [viewModel.zones, teacherCalledZones]);

  const createProactiveAlert = useCallback(() => {
    dispatch({type: 'CREATE_PROACTIVE_ALERT', payload: viewModel.proactiveInsight});
    sendHardwareCue('ALERT_SIGNAL', 'app3:proactive');
    setActivePanel('alerts');
    showToast('AI 主動巡查已建立提醒');
  }, [viewModel.proactiveInsight, sendHardwareCue, showToast]);

  const recordAcousticSignal = useCallback((signal: Omit<AcousticSignal, 'id' | 'createdAt'>) => {
    dispatch({type: 'RECORD_ACOUSTIC_SIGNAL', payload: signal});
    showToast('已記錄本機環境紀錄');
  }, [showToast]);

  const createAcousticAlert = useCallback(() => {
    if (!acousticLocation.trim()) { showToast('請先輸入感測位置再建立提醒'); return; }
    dispatch({
      type: 'CREATE_ACOUSTIC_ALERT',
      payload: {
        location: acousticLocation,
        level: currentAcoustic.level,
        volumeIndex: currentAcoustic.volumeIndex,
        volatility: currentAcoustic.volatility,
        summary: currentAcoustic.summary,
      },
    });
    sendHardwareCue('ALERT_SIGNAL', 'app3:acoustic');
    setActivePanel('alerts');
    showToast('已由環境聲量建立提醒');
  }, [acousticLocation, currentAcoustic, sendHardwareCue, showToast]);

  const handleMood = useCallback((mood: MoodType, noteOverride?: string) => {
    const option = moodOptions.find((item) => item.mood === mood) ?? moodOptions[1];
    setSelectedMood(mood);
    dispatch({type: 'ADD_MOOD', payload: {mood, label: option.label, note: noteOverride ?? option.note}});
  }, []);

  const sendMessage = async () => {
    const text = message.trim();
    if (!text || chatBusy) return;
    setMessage('');
    dispatch({type: 'ADD_SUPPORT_MESSAGE', payload: {role: 'student', content: text}});
    setChatBusy(true);
    try {
      const alertSummary = viewModel.openAlerts?.length > 0
        ? `${viewModel.openAlerts.length} 則待處理警報`
        : undefined;
      const reply = await generateSupportReply(text, selectedMood, acousticLocation, alertSummary);
      dispatch({type: 'ADD_SUPPORT_MESSAGE', payload: {role: 'guardian', content: reply}});
    } catch {
      dispatch({type: 'ADD_SUPPORT_MESSAGE', payload: {role: 'guardian', content: '暫時無法回應，請稍後再試。'}});
      showToast('守護者暫時無法回應，請稍後再試');
    } finally {
      setChatBusy(false);
    }
  };

  const stopAcousticMonitor = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    setMicActive(false);
  };

  const startAcousticMonitor = async () => {
    if (micActive) {
      stopAcousticMonitor();
      return;
    }
    if (micStarting) return;
    setMicStarting(true);
    try {
      setMicError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {echoCancellation: true, noiseSuppression: false, autoGainControl: false},
      });
      try {
        const AudioContextCtor = window.AudioContext || (window as typeof window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
        if (!AudioContextCtor) throw new Error('AudioContext unavailable');
        const audioContext = new AudioContextCtor();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        mediaStreamRef.current = stream;
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        setMicActive(true);

        const buffer = new Uint8Array(analyser.fftSize);
        let rafFrameCount = 0;
        const tick = () => {
          analyser.getByteTimeDomainData(buffer);
          const reading = analyzeAcousticFrame(buffer, volumeHistoryRef.current);
          volumeHistoryRef.current = [...volumeHistoryRef.current.slice(-24), reading.volumeIndex];
          rafFrameCount = (rafFrameCount + 1) % 6;
          if (rafFrameCount === 0) setCurrentAcoustic(reading);
          animationFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (setupError) {
        stream.getTracks().forEach((track) => track.stop());
        throw setupError;
      }
    } catch {
      setMicError('麥克風不可用（請確認瀏覽器權限或裝置硬體），可改用本機樣本訊號。');
      showToast('麥克風權限未開啟，可改用本機聲量樣本');
    } finally {
      setMicStarting(false);
    }
  };

  const exportSystemData = () => {
    const blob = new Blob([JSON.stringify({app: 'AI 校園心靈守護者', exportedAt: new Date().toISOString(), state}, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mindful-guardian-state-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('系統資料已匯出');
  };

  const importSystemData = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      dispatch({type: 'RESTORE_DEMO_STATE', payload: {state: normalizeGuardianState(parsed.state ?? parsed)}});
      showToast('系統資料已匯入並完成匿名安全修復');
    } catch {
      showToast('匯入失敗，請選擇系統資料檔');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  return (
    <div className="guardian-shell min-h-screen overflow-x-hidden bg-[linear-gradient(160deg,#f5f9fc_0%,#eef3f8_60%,#e8f0f7_100%)] text-slate-950">
      {!STATIC_DEMO_APP && <HardwareStatusBanner status={hwStatus} />}
      <CommandFeedbackToast lastCommandAck={hwStatus.lastCommandAck} />
      <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void importSystemData(event.target.files?.[0])} />
      <Toast message={toastMessage} />
      <DispatchConfirmDialog
        pending={dispatchConfirm}
        onCancel={() => setDispatchConfirm(null)}
        onConfirm={(zone) => confirmRobotDispatch(zone)}
      />
      <FrontendPairingModal
        open={showFrontendPairing}
        clientCount={robotDisplayClientCount}
        onClientCountChange={setRobotDisplayClientCount}
        onClose={() => setShowFrontendPairing(false)}
      />

      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/95 shadow-[0_1px_12px_rgba(15,23,42,0.06)] backdrop-blur-xl">

        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => setActivePanel(null)}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-teal-500 to-teal-700 text-white shadow-md shadow-teal-200/60">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="line-clamp-1 text-base font-black tracking-tight sm:text-xl">AI 校園心靈守護者</h1>
              <p className="text-[10px] font-black text-teal-600">校園安心小站</p>
            </div>
          </button>

          {/* Bridge + campus health status */}
          <div className="hidden items-center gap-2 md:flex">
            <BridgeStatusPill online={bridgeOnline} sensorCount={zoneSensors.filter((s) => s.connected).length} />
            <div
              title={proxyOnline === null ? 'AI 連線檢查中' : proxyOnline ? `AI 已連線${proxyHealth.model ? `：${proxyHealth.model}` : ''}` : `本機 AI 備援已啟用：${proxyHealth.message}`}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-600"
            >
              <span className={`h-2 w-2 rounded-full ${proxyOnline === null ? 'animate-pulse bg-slate-300' : proxyOnline ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              {proxyOnline === null ? 'AI 檢查中' : proxyOnline ? 'AI 已連線' : 'AI 備援'}
            </div>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {viewModel.campusHealthLabel}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick alert — always one tap away */}
            <button
              type="button"
              onClick={() => setShowFrontendPairing(true)}
              className="relative flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-black text-teal-700 shadow-sm transition hover:bg-teal-100"
            >
              <QrCode className="h-4 w-4" />
              <span className="hidden sm:inline">外部螢幕</span>
              <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black ${robotDisplayClientCount > 0 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {robotDisplayClientCount}
              </span>
            </button>
            {/* Sensor setup button */}
            <button
              onClick={() => setShowSetup(true)}
              className="relative flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:border-teal-200 hover:text-teal-700"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">感測器</span>
              {(detectedPorts.some((p) => !p.assignedZone) || !drivePorts.some((p) => p.assignedDrive)) && (
                <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[8px] font-black text-white shadow">
                  !
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* AI health banner — below header so it never covers navigation */}
      {proxyOnline === false && !bannerDismissed && !STATIC_DEMO_APP && (
        <div role="status" className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span>本機 AI 備援已啟用：{proxyHealth.message}。區域判讀、事件分級、建議話術與派遣閉環仍可完整展示。</span>
          <button
            onClick={() => setBannerDismissed(true)}
            aria-label="關閉提示"
            className="flex h-11 w-11 shrink-0 items-center justify-center font-medium text-amber-700 hover:text-amber-950"
          >
            ✕
          </button>
        </div>
      )}

      <main className="mx-auto grid max-w-[1600px] gap-4 px-4 py-3 pb-24 sm:px-6 lg:min-h-[calc(100dvh-6rem)] lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:pb-4 xl:gap-5">
          <CommandCenterScreen
            viewModel={viewModel}
            selectedZone={selectedZone}
            selectedZoneId={selectedZoneId}
            robotMapZone={robotMapZone}
            robotDisplayClientCount={robotDisplayClientCount}
            robotFeedback={robotFeedback}
            robotTravel={robotTravel}
            zoneAssessments={zoneAssessments}
            teacherCalledZones={teacherCalledZones}
            zoneCooldowns={zoneCooldowns}
            cooldownNow={cooldownNow}
            onSelectZone={selectZoneForStatus}
            onOpenZoneInsight={openZoneInsight}
            onPrepareManualEvent={prepareManualEventForZone}
            onOpenPanel={setActivePanel}
            onCreateProactiveAlert={createProactiveAlert}
            onDispatchRobot={dispatchRobotToZone}
          />

        <aside className="hidden lg:sticky lg:top-21 lg:flex lg:max-h-[calc(100dvh-6rem)] lg:flex-col lg:gap-3 lg:overflow-hidden">
          <div data-tour="zone-inspector"><ZoneInspector zone={selectedZone} robotFeedback={robotFeedback} teacherCalledZones={teacherCalledZones} onOpenZoneInsight={openZoneInsight} onPrepareManualEvent={prepareManualEventForZone} onDispatchRobot={dispatchRobotToZone} /></div>
          <div data-tour="panel-dock">
            <PanelDock
              activePanel={activePanel}
              selectedZone={selectedZone}
              robotFeedback={robotFeedback}
              teacherCalledZones={teacherCalledZones}
              onOpenPanel={setActivePanel}
              onOpenZoneInsight={openZoneInsight}
              onPrepareManualEvent={prepareManualEventForZone}
              onDispatchRobot={dispatchRobotToZone}
            />
          </div>
        </aside>
      </main>

      {/* Mobile bottom 3-tab nav */}
      <nav className="fixed bottom-0 inset-x-0 z-40 grid grid-cols-3 border-t border-slate-200/80 bg-white/95 backdrop-blur-xl lg:hidden">
        {panelNav.map((item) => (
          <button
            key={item.id}
            onClick={() => setActivePanel(activePanel === item.id ? null : item.id)}
            className={`flex flex-col items-center justify-center gap-1 py-3 text-[10px] font-black transition-colors ${
              activePanel === item.id ? 'text-teal-600 bg-teal-50/60' : 'text-slate-500 hover:text-teal-600'
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </button>
        ))}
      </nav>

      <DetailDrawer
        activePanel={activePanel}
        state={state}
        selectedAlert={selectedAlert}
        setSelectedAlert={setSelectedAlert}
        latestMood={latestMood}
        selectedMood={selectedMood}
        message={message}
        setMessage={setMessage}
        chatBusy={chatBusy}
        micActive={micActive}
        micError={micError}
        currentAcoustic={currentAcoustic}
        acousticLocation={acousticLocation}
        setAcousticLocation={setAcousticLocation}
        proactiveInsight={viewModel.proactiveInsight}
        robotFeedback={robotFeedback}
        teacherCalledZones={teacherCalledZones}
        onClose={() => setActivePanel(null)}
        onMood={handleMood}
        onSendMessage={sendMessage}
        onStartAcoustic={startAcousticMonitor}
        onRecordAcoustic={recordAcousticSignal}
        onCreateAcousticAlert={createAcousticAlert}
        onCreateProactiveAlert={createProactiveAlert}
        onSampleSound={() => {
          const sample = describeAcousticSignal(55 + Math.floor(Math.random() * 35), 18 + Math.floor(Math.random() * 28));
          setCurrentAcoustic(sample);
          recordAcousticSignal({source: 'demo', location: acousticLocation, ...sample});
        }}
        onRestartNode={(id) => {
          dispatch({type: 'RESTART_NODE', payload: {id}});
          sendHardwareCue('NODE_RESTART', `app3:node:${id}`);
        }}
        onDispatchRobot={(zone) => dispatchRobotToZone(zone)}
        onHardwareCommand={(command, source) => sendHardwareCue(command, `app3:${source}`)}
        dispatch={dispatch}
        zones={viewModel.zones}
        selectedZone={selectedZone}
        zoneAssessments={zoneAssessments}
        manualEventZoneId={manualEventZoneId}
        manualEventText={manualEventText}
        manualEventBusy={manualEventBusy}
        manualEventResult={manualEventResult}
        setManualEventZoneId={setManualEventZoneId}
        setManualEventText={setManualEventText}
        setManualEventResult={setManualEventResult}
        onSelectZone={selectZoneForStatus}
        onOpenZoneInsight={openZoneInsight}
        onPrepareManualEvent={prepareManualEventForZone}
        onSubmitManualEvent={() => void submitManualEvent()}
        bridgeOnline={bridgeOnline}
        sensors={zoneSensors}
      />

      {/* Sensor setup modal */}
      <AnimatePresence>
        {showSetup && (
          <SensorSetupModal
            ports={detectedPorts}
            drivePorts={drivePorts}
            sensors={zoneSensors}
            onClose={() => setShowSetup(false)}
            onChanged={async () => {
              const [ports, drive] = await Promise.all([
                fetchSensorPorts(),
                fetchDrivePorts(),
              ]);
              setDetectedPorts(ports);
              setDrivePorts(drive.ports);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {zoneInsightDialog && (
          <ZoneInsightDialog
            insight={zoneInsightDialog}
            onRefresh={(zone) => {
              setZoneInsightDialog((current) => current?.zone.id === zone.id ? {...current, loading: true, error: undefined} : current);
              void requestZoneInsight(zone, 'detail').then((result) => {
                setZoneInsightDialog((current) => current?.zone.id === zone.id ? {...current, loading: false, result} : current);
              });
            }}
            onClose={() => setZoneInsightDialog(null)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}

function buildCommandCenterViewModel(state: GuardianState, sensorReadings: ZoneSensorReading[] = []): CommandCenterViewModel {
  const liveSensorReadings = sensorReadings.some((sensor) => sensor.connected)
    ? sensorReadings
    : createDemoZoneSensorReadings();
  const demoSensors = liveSensorReadings.some((sensor) => sensor.portPath?.startsWith('demo-sensor'));
  const zones = buildSchoolZoneStatuses(state, liveSensorReadings);
  const activeZones = zones.filter((zone) => zone.sensor);
  const highestZone = [...activeZones].sort((a, b) => b.riskScore - a.riskScore)[0] ?? zones[0];
  const dispatchableZones = activeZones.filter((zone) => zone.riskLevel !== 'low');
  const proactiveInsight = evaluateProactiveGuardianState(state);
  const openAlerts = state.alerts.filter((alert) => alert.status !== 'resolved');
  const highPriorityCount = openAlerts.filter((alert) => alert.riskLevel === 'high').length;
  const activeRobotCount = state.robotMissions.filter((mission) => mission.status !== 'completed').length;
  const offlineNodeCount = state.nodes.filter((node) => node.status === 'offline').length;
  const onlineSensorCount = liveSensorReadings.filter((sensor) => sensor.connected).length;
  const campusHealthLabel = activeZones.length === 0 ? '請先指派感測器位置' : highestZone?.riskLevel === 'high' ? '高風險區需立即確認' : highestZone?.riskLevel === 'medium' ? '校園有區域需觀察' : '全校維持穩定巡查';
  const signalSummary: CommandCenterViewModel['signalSummary'] = [
    {label: '待關懷提醒', value: `${openAlerts.length} 則`, tone: openAlerts.length > 3 ? 'amber' : 'teal'},
    {label: '高優先處理', value: `${highPriorityCount} 則`, tone: highPriorityCount > 0 ? 'rose' : 'emerald'},
    {label: '感測器', value: demoSensors ? '展示 3/3' : `${onlineSensorCount}/3 在線`, tone: onlineSensorCount >= 3 ? 'emerald' : 'amber'},
    {label: '節點狀態', value: `${offlineNodeCount} 離線`, tone: offlineNodeCount > 0 ? 'rose' : 'emerald'},
  ];

  return {zones, highestZone, dispatchableZones, proactiveInsight, openAlerts, highPriorityCount, activeRobotCount, campusHealthLabel, signalSummary};
}

function applyZoneAssessments(viewModel: CommandCenterViewModel, assessments: Record<string, ZoneInsightAssessment>): CommandCenterViewModel {
  const zones = viewModel.zones.map((zone) => {
    if (!zone.sensor) return zone;
    const assessment = assessments[zone.id];
    if (!assessment) return zone;
    const riskLevel = normalizeRiskLevel(assessment.riskLevel);
    const confidence = typeof assessment.confidence === 'number' ? assessment.confidence : riskLevel === 'high' ? 86 : riskLevel === 'medium' ? 58 : 26;
    const levelBase = riskLevel === 'high' ? 72 : riskLevel === 'medium' ? 46 : 18;
    const riskScore = Math.max(0, Math.min(100, Math.round(levelBase + confidence * 0.18)));
    return {
      ...zone,
      riskLevel,
      riskScore,
      stability: Math.max(0, 100 - riskScore),
      summary: cleanDisplayText(assessment.summary, zone.summary),
    };
  });
  const activeZones = zones.filter((zone) => zone.sensor);
  const highestZone = [...activeZones].sort((a, b) => b.riskScore - a.riskScore)[0] ?? zones[0];
  const dispatchableZones = activeZones.filter((zone) => zone.riskLevel !== 'low');
  const campusHealthLabel = activeZones.length === 0 ? '請先指派感測器位置' : highestZone?.riskLevel === 'high' ? '高風險區需立即確認' : highestZone?.riskLevel === 'medium' ? '校園有區域需觀察' : '全校維持穩定巡查';
  return {...viewModel, zones, highestZone, dispatchableZones, campusHealthLabel};
}

function CommandCenterScreen({
  viewModel,
  selectedZone,
  selectedZoneId,
  robotMapZone,
  robotDisplayClientCount,
  robotFeedback,
  robotTravel,
  zoneAssessments,
  teacherCalledZones,
  zoneCooldowns,
  cooldownNow,
  onSelectZone,
  onOpenZoneInsight,
  onPrepareManualEvent,
  onOpenPanel,
  onCreateProactiveAlert,
  onDispatchRobot,
}: {
  viewModel: CommandCenterViewModel;
  selectedZone: SchoolZoneStatus;
  selectedZoneId: string | null;
  robotMapZone: SchoolZoneStatus;
  robotDisplayClientCount: number;
  robotFeedback: RobotDispatchFeedback;
  robotTravel: RobotTravelState;
  zoneAssessments: Record<string, ZoneInsightAssessment>;
  teacherCalledZones: Record<string, boolean>;
  zoneCooldowns: Record<string, number>;
  cooldownNow: number;
  onSelectZone: (zone: SchoolZoneStatus) => void;
  onOpenZoneInsight: (zone: SchoolZoneStatus) => void;
  onPrepareManualEvent: (zone: SchoolZoneStatus, seedText?: string) => void;
  onOpenPanel: (panel: ActivePanel) => void;
  onCreateProactiveAlert: () => void;
  onDispatchRobot: (zone: SchoolZoneStatus) => void;
}) {
  const handoffZone = viewModel.zones.find((zone) => teacherCalledZones[zone.id]);
  const headlineZone = handoffZone ?? viewModel.highestZone;
  const headlineTeacherCalled = Boolean(handoffZone);
  const showcaseHighlights = [
    {label: 'AI 多模態', value: '聲音 / 影像 / 情緒融合', tone: 'teal' as SignalTone, icon: Radar},
    {label: '隱私優先', value: '匿名訊號與本機備援', tone: 'violet' as SignalTone, icon: ShieldCheck},
    {label: 'Robot 閉環', value: '派遣 / 到場 / 老師接手', tone: 'emerald' as SignalTone, icon: Bot},
    {label: '即時聲量', value: '動畫指針與趨勢線', tone: 'amber' as SignalTone, icon: Volume2},
  ];
  const campusStatusLabel = handoffZone ? `${handoffZone.name} · 老師接手中` : viewModel.campusHealthLabel;
  return (
    <section className="grid gap-3 lg:max-h-[calc(100dvh-6rem)] lg:grid-rows-[auto_minmax(0,1fr)]">
      <div data-tour="signal-overview">
        <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-linear-to-br from-white to-teal-50/40 shadow-sm">
          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-black text-teal-600 tracking-wide">校園指揮中心</p>
                <h2 className="mt-1.5 text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">校園即時總覽</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">{campusStatusLabel}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center sm:min-w-[16rem]">
                <SignalTile label={handoffZone ? '處理狀態' : '最高風險'} value={getZoneStatusLabel(headlineZone, headlineTeacherCalled)} tone={getZoneSignalTone(headlineZone, headlineTeacherCalled)} />
                <SignalTile label="機器人" value={robotDisplayClientCount.toString()} tone={robotDisplayClientCount > 0 ? 'emerald' : 'slate'} />
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {showcaseHighlights.map((item) => (
                <ShowcaseHighlight key={item.label} {...item} />
              ))}
            </div>
          </div>
          {/* risk level accent bar */}
          <div className={`h-1 w-full ${getZoneAccentBar(headlineZone, headlineTeacherCalled)}`} />
        </div>
      </div>

      <div data-tour="campus-map" className="min-h-0">
        <CampusMap2D zones={viewModel.zones} selectedZone={selectedZone} selectedZoneId={selectedZoneId} robotMapZone={robotMapZone} robotFeedback={robotFeedback} robotTravel={robotTravel} zoneAssessments={zoneAssessments} teacherCalledZones={teacherCalledZones} zoneCooldowns={zoneCooldowns} cooldownNow={cooldownNow} onSelectZone={onSelectZone} onOpenZoneInsight={onOpenZoneInsight} onPrepareManualEvent={onPrepareManualEvent} onOpenPanel={onOpenPanel} onDispatchRobot={onDispatchRobot} />
      </div>

    </section>
  );
}

function StudentOperationCard({
  selectedZone,
  robotFeedback,
  robotTravel,
  teacherCalledZones,
  onOpenPanel,
  onOpenZoneInsight,
  onPrepareManualEvent,
  onDispatchRobot,
}: {
  selectedZone: SchoolZoneStatus;
  robotFeedback: RobotDispatchFeedback;
  robotTravel: RobotTravelState;
  teacherCalledZones: Record<string, boolean>;
  onOpenPanel: (panel: ActivePanel) => void;
  onOpenZoneInsight: (zone: SchoolZoneStatus) => void;
  onPrepareManualEvent: (zone: SchoolZoneStatus, seedText?: string) => void;
  onDispatchRobot: (zone: SchoolZoneStatus) => void;
}) {
  const teacherCalled = Boolean(teacherCalledZones[selectedZone.id]);
  const dispatchDisabled = isZoneIdle(selectedZone) || selectedZone.riskLevel === 'low' || Boolean(robotTravel) || Boolean(robotFeedback?.zoneId === selectedZone.id) || teacherCalledZones[selectedZone.id];
  const studentStep = teacherCalled
    ? '老師已接手，等待現場回報後再標記結案'
    : isZoneIdle(selectedZone)
    ? '先指派感測器或選擇已有訊號的區域'
    : selectedZone.riskLevel === 'low'
      ? '目前穩定，可補充現場紀錄或進入照護'
      : '先看 AI 判讀，再由老師確認派遣';

  return (
    <Surface className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black tracking-widest text-teal-600 uppercase">學生操作主線</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">以學生視角完成現場判斷</h3>
          <p className="mt-1 text-sm font-bold text-slate-500">{studentStep}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[24rem]">
          <StepPill index="1" label="選區域" active />
          <StepPill index="2" label="AI 整理" active={!isZoneIdle(selectedZone)} />
          <StepPill index="3" label={teacherCalled ? '老師接手' : '老師確認'} active={teacherCalled || Boolean(robotFeedback) || Boolean(robotTravel)} />
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => onPrepareManualEvent(selectedZone)}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-teal-200 hover:bg-teal-50"
        >
          補現場事件
        </button>
        <button
          type="button"
          onClick={() => onOpenZoneInsight(selectedZone)}
          disabled={isZoneIdle(selectedZone)}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          查看 AI 判讀
        </button>
        <button
          type="button"
          onClick={() => onOpenPanel('care')}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-teal-200 hover:bg-teal-50"
        >
          學生照護
        </button>
        <button
          type="button"
          onClick={() => onDispatchRobot(selectedZone)}
          disabled={dispatchDisabled}
          className="min-h-11 rounded-xl bg-teal-600 px-3 text-sm font-black text-white transition hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-500"
        >
          {teacherCalled ? '老師已接手' : isZoneIdle(selectedZone) ? '請先指派感測器' : selectedZone.riskLevel === 'low' ? '目前穩定，不需派遣' : '老師確認派遣'}
        </button>
      </div>
    </Surface>
  );
}

function StepPill({index, label, active}: {index: string; label: string; active: boolean}) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${active ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
      <p className="text-[10px] font-black">{index}</p>
      <p className="text-xs font-black">{label}</p>
    </div>
  );
}

const ZONE_EMOJI: Record<string, string> = {
  'zone-library': '📚',
  'zone-hall': '🚶',
  'zone-field': '⚽',
};

const ZONE_IDENTITY: Record<string, {bg: string; border: string; dot: string}> = {
  'zone-library': {bg: 'bg-blue-50/95',    border: 'border-blue-300',    dot: 'bg-blue-500'},
  'zone-hall':    {bg: 'bg-emerald-50/95', border: 'border-emerald-300', dot: 'bg-emerald-500'},
  'zone-field':   {bg: 'bg-emerald-50/95', border: 'border-emerald-300', dot: 'bg-emerald-500'},
};
const ZONE_IDENTITY_FALLBACK = {bg: 'bg-white/95', border: 'border-slate-200', dot: 'bg-slate-400'};
const MAP_HIT_AREAS: Record<string, {left: string; top: string; width: string; height: string}> = {
  'zone-library': {left: '7%', top: '17%', width: '30%', height: '38%'},
  'zone-hall': {left: '41%', top: '18%', width: '24%', height: '38%'},
  'zone-field': {left: '70%', top: '15%', width: '24%', height: '49%'},
};

function CampusMap2D({
  zones,
  selectedZone,
  selectedZoneId,
  robotMapZone,
  robotFeedback,
  robotTravel,
  zoneAssessments,
  teacherCalledZones,
  zoneCooldowns,
  cooldownNow,
  onSelectZone,
  onOpenZoneInsight,
  onPrepareManualEvent,
  onOpenPanel,
  onDispatchRobot,
}: {
  zones: SchoolZoneStatus[];
  selectedZone: SchoolZoneStatus;
  selectedZoneId: string | null;
  robotMapZone: SchoolZoneStatus;
  robotFeedback: RobotDispatchFeedback;
  robotTravel: RobotTravelState;
  zoneAssessments: Record<string, ZoneInsightAssessment>;
  teacherCalledZones: Record<string, boolean>;
  zoneCooldowns: Record<string, number>;
  cooldownNow: number;
  onSelectZone: (zone: SchoolZoneStatus) => void;
  onOpenZoneInsight: (zone: SchoolZoneStatus) => void;
  onPrepareManualEvent: (zone: SchoolZoneStatus, seedText?: string) => void;
  onOpenPanel: (panel: ActivePanel) => void;
  onDispatchRobot: (zone: SchoolZoneStatus) => void;
}) {
  const robotLeft = Math.min(robotMapZone.x, 76);
  const mapLocked = Boolean(robotTravel);
  const selectedDispatch = robotFeedback?.zoneId === selectedZone.id || robotTravel?.to.zoneId === selectedZone.id;
  const markerDispatch = robotFeedback?.zoneId === robotMapZone.id || robotTravel?.to.zoneId === robotMapZone.id;
  const dispatchProgress = getRobotStageProgress(selectedDispatch ? robotFeedback?.stage : undefined);
  const selectedIdle = isZoneIdle(selectedZone);
  const selectedTeacherCalled = Boolean(teacherCalledZones[selectedZone.id]);
  const travelColor = selectedIdle && !selectedTeacherCalled ? '#94a3b8' : getRiskStatusColor(robotTravel?.riskLevel ?? selectedZone.riskLevel, selectedTeacherCalled);

  return (
    <Surface className="relative flex min-h-0 flex-col overflow-hidden p-3 sm:p-4 lg:h-full">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black text-teal-600">校園平面圖</p>
          <h3 className="text-xl font-black text-slate-950">區域狀態</h3>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-black text-slate-500">
          <LegendDot tone="emerald" label="安全" />
          <LegendDot tone="amber" label="注意" />
          <LegendDot tone="rose" label="高風險" />
          <LegendDot tone="violet" label="老師接手" />
        </div>
      </div>
      <ZoneStatusBar
        zones={zones}
        selectedZoneId={selectedZone.id}
        robotFeedback={robotFeedback}
        zoneAssessments={zoneAssessments}
        teacherCalledZones={teacherCalledZones}
        zoneCooldowns={zoneCooldowns}
        cooldownNow={cooldownNow}
        onSelectZone={onSelectZone}
        onOpenZoneInsight={onOpenZoneInsight}
      />
      <div className="relative min-h-[20rem] flex-1 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-inner lg:min-h-0">
        <img
          src="./campus-map-cartoon.png"
          alt="卡通風校園地圖"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        <div className="absolute inset-0 bg-white/5" />
        {zones.map((zone) => {
          const area = MAP_HIT_AREAS[zone.id] ?? MAP_HIT_AREAS['zone-hall'];
          const selected = zone.id === selectedZoneId;
          const teacherCalled = Boolean(teacherCalledZones[zone.id]);
          const idle = isZoneIdle(zone);
          const statusColor = idle && !teacherCalled ? '#94a3b8' : getRiskStatusColor(zone.riskLevel, teacherCalled);
          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => {
                if (mapLocked) return;
                onSelectZone(zone);
              }}
              disabled={mapLocked}
              className={`absolute rounded-[1.75rem] border-2 transition focus:outline-none focus:ring-4 ${teacherCalled ? 'focus:ring-violet-200' : 'focus:ring-teal-200'} ${mapLocked ? 'cursor-not-allowed opacity-75' : 'hover:bg-white/10'} ${selected ? teacherCalled ? 'border-violet-600 bg-violet-50/20 shadow-[0_14px_40px_rgba(139,92,246,0.20)]' : 'border-teal-600 bg-white/15 shadow-[0_14px_40px_rgba(13,148,136,0.14)]' : 'border-transparent'}`}
              style={{left: area.left, top: area.top, width: area.width, height: area.height}}
              aria-label={`選取${zone.name}`}
            >
              <span
                className={`absolute rounded-full px-3 py-1 text-xs font-black shadow-sm ring-1 ring-white/80 ${selected ? 'bg-white text-slate-950' : 'bg-white/82 text-slate-600'}`}
                style={{left: '50%', top: '50%', transform: 'translate(-50%, -50%)'}}
              >
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{backgroundColor: statusColor}} />
                {zone.name}
              </span>
            </button>
          );
        })}
        <div
          className={`robot-route-line absolute z-8 h-1.5 origin-left rounded-full ${markerDispatch ? 'opacity-100' : 'opacity-0'}`}
          style={{
            left: '48%',
            top: '48%',
            width: `${Math.max(8, Math.min(30, Math.abs(robotLeft - 48) + Math.abs(Math.min(robotMapZone.y + 16, 82) - 48) / 2))}%`,
            transform: `rotate(${robotLeft > 48 ? -18 : 28}deg)`,
          }}
        />
        <div
          className={`robot-marker absolute z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-2xl border border-teal-200 bg-white text-teal-700 shadow-xl shadow-teal-200/60 ${markerDispatch ? 'robot-marker-active' : ''}`}
          style={{left: `${robotLeft + 8}%`, top: `${Math.min(robotMapZone.y + 16, 82)}%`}}
        >
          <div className="absolute -right-1.5 -top-1.5 rounded-full bg-teal-600 px-1.5 py-0.5 text-[9px] font-black text-white shadow-sm">
            {robotFeedback?.missionId ?? 'R-01'}
          </div>
          <Bot className="h-6 w-6" />
          <span className="text-[9px] font-black text-slate-500 leading-none">{markerDispatch ? robotFeedback?.stage : '待命'}</span>
        </div>
        <div className="hidden">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <div>
              <p className="text-xs font-black text-slate-500">選取區域</p>
              <p className="font-black text-slate-950">{selectedZone.name} · {getZoneStatusLabel(selectedZone, selectedTeacherCalled)}</p>
              <TeacherCalledText zoneId={selectedZone.id} teacherCalledZones={teacherCalledZones} />
              <CooldownText zoneId={selectedZone.id} cooldowns={zoneCooldowns} now={cooldownNow} />
            </div>
            {selectedTeacherCalled ? <TeacherHandoffChip /> : selectedIdle ? <IdleChip /> : <StatusChip level={selectedZone.riskLevel} />}
            <button
              onClick={() => onDispatchRobot(selectedZone)}
              disabled={selectedIdle || selectedZone.riskLevel === 'low' || selectedDispatch || mapLocked || teacherCalledZones[selectedZone.id]}
              className={`min-h-10 rounded-xl px-4 text-xs font-black text-white transition active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed ${selectedDispatch ? 'bg-emerald-600 ring-4 ring-emerald-100' : 'bg-teal-600 hover:bg-teal-700'}`}
            >
              {selectedTeacherCalled ? '老師已接手' : selectedIdle ? '待機' : mapLocked ? '移動中' : selectedZone.riskLevel === 'low' ? '維持巡查' : selectedDispatch ? robotFeedback?.stage : '派遣'}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onOpenZoneInsight(selectedZone)}
              disabled={selectedIdle}
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              AI 判讀
            </button>
            <button
              type="button"
              onClick={() => onPrepareManualEvent(selectedZone)}
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 transition hover:border-teal-200 hover:bg-teal-50"
            >
              新增事件
            </button>
            <button
              type="button"
              onClick={() => onOpenPanel('alerts')}
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 transition hover:border-teal-200 hover:bg-teal-50"
            >
              看預警
            </button>
          </div>
          {selectedDispatch && (
            <motion.div
              initial={{opacity: 0, y: 8}}
              animate={{opacity: 1, y: 0}}
              exit={{opacity: 0, y: 8}}
              className="mt-3 grid gap-2 rounded-lg bg-teal-50 px-3 py-2 text-xs font-black text-teal-800 sm:grid-cols-[auto_1fr_auto] sm:items-center"
            >
              <Bot className="h-4 w-4" />
              <span>{robotFeedback?.missionId} · {robotFeedback?.stage}</span>
              <span className="text-teal-700">{robotFeedback?.stage === '老師確認' ? '通知老師' : '持續回傳'}</span>
            </motion.div>
          )}
          {selectedDispatch && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <motion.div animate={{width: `${dispatchProgress}%`}} className="h-full rounded-full bg-teal-600" />
            </div>
          )}
          <DispatchProgress stage={selectedDispatch ? robotFeedback?.stage : undefined} connected={selectedDispatch} className="mt-3" compact />
        </div>
      </div>
      <AnimatePresence>
        {robotTravel && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[3px]"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <motion.div
              key={robotTravel.startedAt}
              className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-2xl shadow-slate-950/25"
              initial={{y: 14, scale: 0.98}}
              animate={{y: 0, scale: 1}}
              exit={{y: 14, scale: 0.98}}
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-[10px] font-black tracking-widest text-teal-600 uppercase">Robot Dispatch</p>
                  <h4 className="mt-0.5 text-2xl font-black text-slate-950">移動中</h4>
                </div>
                <span className="rounded-full px-3 py-1 text-xs font-black text-white shadow-sm" style={{background: travelColor}}>
                  地圖鎖定
                </span>
              </div>
              <div className="p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] font-black text-slate-400">出發</p>
                    <p className="mt-1 truncate text-lg font-black text-slate-900">{robotTravel.from.name}</p>
                    <p className="truncate text-xs font-bold text-slate-500">{robotTravel.from.location}</p>
                  </div>
                  <div className="hidden h-px w-10 bg-slate-200 sm:block" />
                  <div className="rounded-xl border p-3" style={{borderColor: `${travelColor}55`, background: `${travelColor}10`}}>
                    <p className="text-[10px] font-black text-slate-400">目的地</p>
                    <p className="mt-1 truncate text-lg font-black" style={{color: travelColor}}>{robotTravel.to.name}</p>
                    <p className="truncate text-xs font-bold text-slate-500">{robotTravel.to.location}</p>
                  </div>
                </div>
                <div className="relative mt-4 h-24 overflow-hidden rounded-2xl border border-slate-200 bg-linear-to-br from-slate-50 to-white">
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 360 90" preserveAspectRatio="none" aria-hidden="true">
                    <motion.path
                      d="M28 52 C105 8 238 8 332 52"
                      fill="none"
                      stroke={travelColor}
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray="10 12"
                      initial={{pathLength: 0, opacity: 0.45}}
                      animate={{pathLength: 1, opacity: 0.9}}
                      transition={{duration: robotTravel.durationMs / 1000, ease: 'linear'}}
                    />
                  </svg>
                  <span className="absolute left-[8%] top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-white" style={{background: travelColor}} />
                  <span className="absolute left-[92%] top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-white" style={{background: travelColor}} />
                  <motion.div
                    className="absolute top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl text-white shadow-xl"
                    style={{background: travelColor, boxShadow: `0 18px 34px -16px ${travelColor}`}}
                    initial={{left: '8%'}}
                    animate={{left: '92%'}}
                    transition={{duration: robotTravel.durationMs / 1000, ease: [0.34, 0.9, 0.23, 1]}}
                  >
                    <Bot className="h-6 w-6" />
                  </motion.div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <motion.div
                    className="h-full rounded-full"
                    style={{background: travelColor}}
                    initial={{width: '0%'}}
                    animate={{width: '100%'}}
                    transition={{duration: robotTravel.durationMs / 1000, ease: 'linear'}}
                  />
                </div>
                <p className="mt-3 text-center text-xs font-bold text-slate-500">移動期間暫停地圖選取與派遣操作，預計 5 秒抵達。</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Surface>
  );
}

function ZoneStatusBar({
  zones,
  selectedZoneId,
  robotFeedback,
  zoneAssessments,
  teacherCalledZones,
  zoneCooldowns,
  cooldownNow,
  onSelectZone,
  onOpenZoneInsight,
}: {
  zones: SchoolZoneStatus[];
  selectedZoneId: string;
  robotFeedback: RobotDispatchFeedback;
  zoneAssessments: Record<string, ZoneInsightAssessment>;
  teacherCalledZones: Record<string, boolean>;
  zoneCooldowns: Record<string, number>;
  cooldownNow: number;
  onSelectZone: (zone: SchoolZoneStatus) => void;
  onOpenZoneInsight: (zone: SchoolZoneStatus) => void;
}) {
  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black tracking-widest text-teal-600 uppercase">AI 區域燈號</p>
          <p className="text-xs font-bold text-slate-500">點選卡片只會選取區域，不會自動派遣或跳窗</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-slate-500 ring-1 ring-slate-200">
          感測器數值優先
        </span>
      </div>
      <div className="p-2">
      <div className="grid gap-2 md:grid-cols-3">
        {zones.map((zone) => {
          const selected = zone.id === selectedZoneId;
          const dispatching = robotFeedback?.zoneId === zone.id;
          const teacherCalled = Boolean(teacherCalledZones[zone.id]);
          const identity = ZONE_IDENTITY[zone.id] ?? ZONE_IDENTITY_FALLBACK;
          const assessment = zoneAssessments[zone.id];
          const idle = isZoneIdle(zone);
          const cardBorder = teacherCalled ? 'border-violet-300' : idle ? 'border-slate-200' : zone.riskLevel === 'high' ? 'border-rose-300' : zone.riskLevel === 'medium' ? 'border-amber-300' : 'border-emerald-300';
          const tone = getZoneTone(zone, teacherCalled);
          const statusLabel = teacherCalled ? '老師接手' : dispatching ? '派遣中' : getZoneStatusLabel(zone);
          const sensor = zone.sensor;
          const sourceLabel = teacherCalled ? '老師接手中' : idle ? '未指派' : !assessment ? '待判讀' : assessment.source === 'fallback' ? '本機 AI 備援' : '雲端 AI 判讀';
          const selectedRing = selected
            ? teacherCalled
              ? 'ring-2 ring-violet-500 ring-offset-1 ring-offset-slate-50'
              : 'ring-2 ring-teal-500 ring-offset-1 ring-offset-slate-50'
            : '';

          return (
            <button
              key={zone.id}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                onSelectZone(zone);
              }}
              className={`group relative min-h-32 overflow-hidden rounded-xl border-2 bg-white px-3 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99] ${cardBorder} ${selectedRing} ${dispatching ? 'zone-dispatch-pulse' : ''}`}
            >
              <span className={`absolute inset-x-0 top-0 h-1 ${tone.bar}`} />
              <span className={`absolute -right-12 -top-12 h-28 w-28 rounded-full opacity-25 blur-xl ${tone.dot}`} />
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${identity.bg} text-lg leading-none ring-1 ring-white/70`}>{ZONE_EMOJI[zone.id] ?? '📍'}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black leading-tight text-slate-900">{zone.name}</p>
                    <p className="mt-0.5 text-[10px] font-bold text-slate-500">{zone.location}</p>
                    <TeacherCalledText zoneId={zone.id} teacherCalledZones={teacherCalledZones} compact />
                    <CooldownText zoneId={zone.id} cooldowns={zoneCooldowns} now={cooldownNow} compact />
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/75 px-2 py-1 text-[10px] font-black text-slate-600 ring-1 ring-slate-200/70">
                  <span className={`h-2 w-2 rounded-full ${teacherCalled ? tone.dot : dispatching ? identity.dot : tone.dot}`} />
                    {teacherCalled ? '老師接手' : idle ? '閒置' : 'AI 判讀'}
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-[0.9fr_1.1fr] sm:items-stretch">
                <div className={`flex min-h-16 flex-col justify-center rounded-xl border px-3 py-2 ${tone.panel}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${tone.dot}`} />
                    <p className={`text-lg font-black leading-tight ${tone.text}`}>{statusLabel}</p>
                  </div>
                  <p className="mt-1 text-[10px] font-black text-slate-500">{teacherCalled ? '已由老師接手處理' : idle ? '等待感測器位置指派' : '依 AI 對感測器數值判斷'}</p>
                  <p className="mt-1 text-[10px] font-black text-slate-400">{sourceLabel}</p>
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5 text-[10px] font-black text-slate-600">
                  <span className="flex min-h-8 items-center justify-center gap-1 rounded-lg bg-white/65 px-1 tabular-nums">
                    <Thermometer className="h-3 w-3 shrink-0 text-rose-400" />
                    {sensor?.connected && sensor.temp !== null ? sensor.temp.toFixed(1) : '--'}°
                  </span>
                  <span className="flex min-h-8 items-center justify-center gap-1 rounded-lg bg-white/65 px-1 tabular-nums">
                    <Droplets className="h-3 w-3 shrink-0 text-blue-400" />
                    {sensor?.connected && sensor.hum !== null ? Math.round(sensor.hum) : '--'}%
                  </span>
                  <span className="flex min-h-8 items-center justify-center gap-1 rounded-lg bg-white/65 px-1 tabular-nums">
                    <Sun className="h-3 w-3 shrink-0 text-amber-400" />
                    {sensor?.connected && sensor.light !== null ? sensor.light : '--'}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}

function ZoneInsightDialog({
  insight,
  onRefresh,
  onClose,
}: {
  insight: NonNullable<ZoneInsightDialogState>;
  onRefresh: (zone: SchoolZoneStatus) => void;
  onClose: () => void;
}) {
  const {zone, loading, result, error} = insight;
  const displayLevel = normalizeRiskLevel(result?.riskLevel ?? zone.riskLevel);
  const tone = getRiskStatusTone(displayLevel);
  const sensor = zone.sensor;
  const situations = result?.situations?.length ? result.situations.map((item) => cleanDisplayText(item, '請依現場回報確認狀況。')) : ['正在整理此區域可能發生的狀況。'];
  const suggestions = result?.suggestions?.length ? result.suggestions.map((item) => cleanDisplayText(item, '請先依區域燈號與現場回報處理。')) : ['請先依區域燈號與現場回報處理。'];
  const displaySummary = cleanDisplayText(result?.summary, error || '目前沒有可用的 AI 判讀內容。');
  const displayStatusLabel = getRiskStatusLabel(displayLevel);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
      initial={{opacity: 0}}
      animate={{opacity: 1}}
      exit={{opacity: 0}}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="zone-insight-title"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
        initial={{opacity: 0, y: 18, scale: 0.98}}
        animate={{opacity: 1, y: 0, scale: 1}}
        exit={{opacity: 0, y: 18, scale: 0.98}}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`h-1.5 ${tone.bar}`} />
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black tracking-wide text-teal-600">AI 區域判讀</p>
              <h3 id="zone-insight-title" className="mt-1 text-2xl font-black text-slate-950">{zone.name}</h3>
              <p className="mt-1 text-sm font-bold text-slate-500">{zone.location}</p>
            </div>
            <button
              onClick={onClose}
              aria-label="關閉區域判讀"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr]">
            <div className={`rounded-2xl border p-4 ${tone.panel}`}>
              <p className="text-[10px] font-black tracking-widest text-slate-500 uppercase">目前狀態</p>
              <div className="mt-3 flex items-center gap-3">
                <span className={`h-5 w-5 rounded-full ${tone.dot}`} />
                <span className={`text-3xl font-black ${tone.text}`}>{displayStatusLabel}</span>
              </div>
              <p className="mt-2 text-xs font-bold text-slate-500">燈號由 AI 依感測器數值判斷；沒有雲端回應時自動使用本機備援規則。</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <SensorMiniStat icon={Thermometer} label="溫度" value={sensor?.connected && sensor.temp !== null ? `${sensor.temp.toFixed(1)}°C` : '--'} tone="text-rose-500" />
              <SensorMiniStat icon={Droplets} label="濕度" value={sensor?.connected && sensor.hum !== null ? `${Math.round(sensor.hum)}%` : '--'} tone="text-blue-500" />
              <SensorMiniStat icon={Sun} label="光照" value={sensor?.connected && sensor.light !== null ? sensor.light.toString() : '--'} tone="text-amber-500" />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black text-slate-500">AI 狀態</p>
              <p className="mt-1 text-xs font-bold text-slate-400">雲端 AI 可用時優先使用；離線時本機備援會接手判讀。</p>
            </div>
            <button
              type="button"
              onClick={() => onRefresh(zone)}
              className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-teal-600 px-3 text-xs font-black text-white shadow-sm shadow-teal-200 transition hover:bg-teal-700"
            >
              <RefreshCw className="h-4 w-4" />
              重新判讀
            </button>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            {loading ? (
              <div className="flex min-h-36 flex-col items-center justify-center gap-3 text-slate-500">
                <RefreshCw className="h-6 w-6 animate-spin text-teal-600" />
                <p className="text-sm font-black">正在整理區域 AI 判讀...</p>
              </div>
            ) : (
              <div className="grid gap-4">
                <div>
                  <p className="text-xs font-black text-slate-400">判讀摘要</p>
                  <p className="mt-1 text-sm font-bold leading-6 text-slate-800">{displaySummary}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InsightList title="可能狀況" items={situations} toneDot={tone.dot} />
                  <InsightList title="建議處置" items={suggestions} toneDot="bg-teal-500" />
                </div>
                <p className="text-[10px] font-bold text-slate-400">
                  來源：{result?.source === 'fallback' ? '本機 AI 備援判讀' : '雲端 AI 判讀'}
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SensorMiniStat({icon: Icon, label, value, tone}: {icon: LucideIcon; label: string; value: string; tone: string}) {
  return (
    <div className="flex min-h-24 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black text-slate-400">{label}</p>
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>
      <p className="text-xl font-black text-slate-950 tabular-nums">{value}</p>
    </div>
  );
}

function InsightList({title, items, toneDot}: {title: string; items: string[]; toneDot: string}) {
  return (
    <div>
      <p className="text-xs font-black text-slate-400">{title}</p>
      <div className="mt-2 grid gap-2">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="flex gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold leading-5 text-slate-700 shadow-sm">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneDot}`} />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManualEventComposer({
  zones,
  manualEventZoneId,
  manualEventText,
  manualEventBusy,
  manualEventResult,
  onSelectZone,
  onTextChange,
  onApplyTemplate,
  onSubmit,
}: {
  zones: SchoolZoneStatus[];
  manualEventZoneId: string;
  manualEventText: string;
  manualEventBusy: boolean;
  manualEventResult: ManualEventResult;
  onSelectZone: (zoneId: string) => void;
  onTextChange: (value: string) => void;
  onApplyTemplate: (template: typeof manualEventTemplates[number]) => void;
  onSubmit: () => void;
}) {
  const hasText = manualEventText.trim().length > 0;
  return (
    <div className="rounded-2xl border border-teal-100 bg-teal-50/70 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black tracking-widest text-teal-700 uppercase">手動新增事件</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">學生操作：選區域 → 補情境 → AI 分級 → 老師確認。</p>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-teal-700 ring-1 ring-teal-100">可手動操作</span>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        <StepPill index="1" label="選區域" active />
        <StepPill index="2" label="填事件" active={hasText} />
        <StepPill index="3" label="建立提醒" active={Boolean(manualEventResult)} />
      </div>
      <select
        value={manualEventZoneId}
        onChange={(event) => onSelectZone(event.target.value)}
        className="mb-2 h-11 w-full rounded-xl border border-teal-100 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-teal-500"
      >
        {zones.map((zone) => (
          <option key={zone.id} value={zone.id}>{zone.name} · {zone.location}</option>
        ))}
      </select>
      <div className="mb-2 grid grid-cols-3 gap-1.5">
        {manualEventTemplates.map((template) => (
          <button
            key={template.label}
            type="button"
            onClick={() => onApplyTemplate(template)}
            className="min-h-10 rounded-xl border border-white bg-white px-2 text-xs font-black text-teal-700 shadow-sm transition hover:border-teal-200 hover:bg-teal-50"
          >
            {template.label}
          </button>
        ))}
      </div>
      <textarea
        value={manualEventText}
        onChange={(event) => onTextChange(event.target.value)}
        maxLength={180}
        rows={4}
        className="w-full resize-none rounded-xl border border-teal-100 bg-white p-3 text-sm font-bold leading-6 text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        placeholder="描述現場觀察，例如：穿堂有學生蹲坐哭泣、不願回教室，需要低壓關懷確認。"
      />
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-bold text-slate-400">
        <span>{hasText ? '送出後只會建立提醒，不會直接移動機器人' : '可先選上方情境，再手動修改文字'}</span>
        <span>{manualEventText.length}/180</span>
      </div>
      {manualEventResult && (
        <div className={`mt-3 rounded-xl border p-3 ${manualEventResult.riskLevel === 'high' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-black">{manualEventResult.zoneName} · {getRiskStatusLabel(manualEventResult.riskLevel)}</p>
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-black">{manualEventResult.source}</span>
          </div>
          <p className="mt-2 text-xs font-bold leading-5">{cleanDisplayText(manualEventResult.summary, `${manualEventResult.zoneName}已建立事件提醒。`)}</p>
          <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[10px] font-black">{manualEventResult.nextStep}</p>
        </div>
      )}
      <button
        onClick={onSubmit}
        disabled={!manualEventText.trim() || manualEventBusy}
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-3 text-sm font-black text-white transition hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-500"
      >
        {manualEventBusy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
        {manualEventBusy ? 'AI 分級中' : '建立事件'}
      </button>
    </div>
  );
}

function OperationsBrief({viewModel, onOpenPanel}: {viewModel: CommandCenterViewModel; onOpenPanel: (panel: ActivePanel) => void}) {
  const accentBar = isZoneIdle(viewModel.highestZone)
    ? 'bg-slate-300'
    : viewModel.highestZone.riskLevel === 'high'
    ? 'bg-linear-to-r from-rose-400 to-rose-600'
    : viewModel.highestZone.riskLevel === 'medium'
      ? 'bg-linear-to-r from-amber-300 to-amber-500'
      : 'bg-linear-to-r from-teal-300 to-teal-500';
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className={`h-1 ${accentBar}`} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black text-slate-400">今日狀態</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">{viewModel.campusHealthLabel}</h3>
          </div>
          {isZoneIdle(viewModel.highestZone) ? <IdleChip /> : <StatusChip level={viewModel.highestZone.riskLevel} />}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={() => onOpenPanel('alerts')} className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-3 text-left transition hover:border-teal-200 hover:bg-teal-50">
            <p className="text-[10px] font-black text-slate-400">預警</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{viewModel.highPriorityCount}</p>
          </button>
          <button onClick={() => onOpenPanel('care')} className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-3 text-left transition hover:border-teal-200 hover:bg-teal-50">
            <p className="text-[10px] font-black text-slate-400">照護</p>
            <p className="mt-1 text-2xl font-black text-slate-950">學生關懷</p>
          </button>
        </div>
      </div>
    </div>
  );
}

function RobotReadinessCard({state, robotFeedback}: {state: GuardianState; robotFeedback: RobotDispatchFeedback}) {
  const latestHardware = state.hardwareEvents[0];
  const connected = latestHardware?.status === 'sent';
  const meta = getRobotStageMeta(robotFeedback?.stage);
  return (
    <Surface className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-500">機器人連動</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{robotFeedback ? `${robotFeedback.zoneName}：${robotFeedback.stage}` : connected ? '硬體已接收' : '系統就緒'}</h3>
          <p className="mt-1 text-xs font-bold text-slate-500">{meta.detail}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black ${connected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {connected ? '已連線' : '備援'}
        </span>
      </div>
      <DispatchProgress stage={robotFeedback?.stage} connected={connected} className="mt-4" />
      <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black">
        <span className="text-slate-500">預估抵達</span>
        <span className={robotFeedback ? 'text-teal-700' : 'text-slate-400'}>{meta.eta}</span>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black">
        <span className="text-slate-500">任務單號</span>
        <span className={robotFeedback ? 'text-slate-900' : 'text-slate-400'}>{robotFeedback?.missionId ?? '尚未建立'}</span>
      </div>
    </Surface>
  );
}

function ZoneInspector({
  zone,
  robotFeedback,
  teacherCalledZones,
  onOpenZoneInsight,
  onPrepareManualEvent,
  onDispatchRobot,
}: {
  zone: SchoolZoneStatus;
  robotFeedback: RobotDispatchFeedback;
  teacherCalledZones: Record<string, boolean>;
  onOpenZoneInsight: (zone: SchoolZoneStatus) => void;
  onPrepareManualEvent: (zone: SchoolZoneStatus, seedText?: string) => void;
  onDispatchRobot: (zone: SchoolZoneStatus) => void;
}) {
  const idle = isZoneIdle(zone);
  const activeDispatch = robotFeedback?.zoneId === zone.id;
  const teacherCalled = Boolean(teacherCalledZones[zone.id]);
  const nextStep = teacherCalled
    ? '老師已接手，這個區域暫停重複派遣；等現場回報後再結案。'
    : idle
    ? '先到「感測器」設定，把實體感測器指派到這個區域。'
    : activeDispatch
      ? '任務已送出，等待機器人到場後回報結果。'
      : zone.riskLevel === 'low'
        ? '目前穩定，可進入學生照護與心情簽到。'
        : '先看 AI 判讀，補充現場事件後，再由老師確認派遣。';
  return (
    <Surface className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black tracking-widest text-teal-600 uppercase">AI 副駕</p>
          <h3 className="mt-1 text-2xl font-black text-slate-950">{zone.name}</h3>
          <p className="mt-0.5 text-xs font-bold text-slate-500">{zone.location} · {getZoneStatusLabel(zone, teacherCalled)}</p>
        </div>
        {teacherCalled ? <TeacherHandoffChip /> : idle ? <IdleChip /> : <StatusChip level={zone.riskLevel} />}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <MetricTile label="燈號" value={getZoneStatusLabel(zone, teacherCalled)} />
        <MetricTile label="感測" value={getZoneSensorLabel(zone)} />
        <MetricTile label="提醒" value={zone.alertCount} />
      </div>
      <div className={`mt-3 rounded-xl border px-3 py-3 ${teacherCalled ? 'border-violet-100 bg-violet-50' : 'border-teal-100 bg-teal-50'}`}>
        <p className={`text-xs font-black ${teacherCalled ? 'text-violet-700' : 'text-teal-700'}`}>下一步</p>
        <p className={`mt-1 text-sm font-bold leading-6 ${teacherCalled ? 'text-violet-950' : 'text-teal-950'}`}>{nextStep}</p>
      </div>
      <div className="mt-3 grid gap-2">
        <button
          type="button"
          onClick={() => onOpenZoneInsight(zone)}
          disabled={idle}
          className="flex min-h-11 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>1. 查看 AI 判讀</span>
          <Radar className="h-4 w-4 text-teal-600" />
        </button>
        <button
          type="button"
          onClick={() => onPrepareManualEvent(zone)}
          className="flex min-h-11 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-teal-200 hover:bg-teal-50"
        >
          <span>2. 補充現場事件</span>
          <MessageSquare className="h-4 w-4 text-teal-600" />
        </button>
      </div>
      {activeDispatch && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between text-xs font-black text-slate-500">
            <span>{robotFeedback?.missionId}</span>
            <span>{getRobotStageProgress(robotFeedback?.stage)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
            <motion.div animate={{width: `${getRobotStageProgress(robotFeedback?.stage)}%`}} className="h-full rounded-full bg-teal-600" />
          </div>
        </div>
      )}
      {activeDispatch && <DispatchProgress stage={robotFeedback?.stage} connected={Boolean(robotFeedback)} className="mt-3" compact />}
      <PrimaryAction onClick={() => onDispatchRobot(zone)} disabled={teacherCalled || idle || zone.riskLevel === 'low' || activeDispatch} active={activeDispatch} className="mt-4">
        <Bot className={`h-5 w-5 ${activeDispatch ? 'animate-pulse' : ''}`} />
        {teacherCalled ? '老師已接手' : idle ? '等待感測器' : zone.riskLevel === 'low' ? '維持巡查' : activeDispatch ? '等待回報' : '3. 老師確認派遣'}
      </PrimaryAction>
    </Surface>
  );
}

function MissionTimeline({state, robotFeedback}: {state: GuardianState; robotFeedback: RobotDispatchFeedback}) {
  const missions = state.robotMissions.slice(0, 6);
  const missionChip = (status: 'dispatching' | 'arrived' | 'completed') => {
    if (status === 'dispatching') return 'bg-amber-100 text-amber-700';
    if (status === 'arrived') return 'bg-teal-100 text-teal-700';
    return 'bg-emerald-100 text-emerald-700';
  };
  return (
    <Surface className="min-h-0 overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black text-slate-950">機器人任務</h3>
        <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-700">{state.robotMissions.length}</span>
      </div>
      <div className="mt-4 max-h-[18rem] space-y-3 overflow-y-auto pr-1">
        {missions.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold leading-6 text-slate-500">
            尚無任務。選取中高風險區即可派遣。
          </div>
        )}
        {missions.map((mission, index) => (
          <div key={mission.id} className={`relative rounded-xl border border-slate-200 bg-slate-50 p-3 pl-9 ${robotFeedback?.zoneName === mission.zoneName && index === 0 ? 'mission-live' : ''}`}>
            <span className="absolute left-3 top-4 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-black text-teal-700 ring-1 ring-slate-200">{index + 1}</span>
            <div className="flex items-center justify-between gap-3">
              <p className="font-black text-slate-900">→ {mission.zoneName}</p>
              <span className={`rounded-full px-2 py-1 text-[10px] font-black ${missionChip(mission.status)}`}>
                {mission.status === 'dispatching' ? '派遣中' : mission.status === 'arrived' ? '已到達' : '完成'}
              </span>
            </div>
            <MissionProgress status={mission.status} live={robotFeedback?.zoneName === mission.zoneName && index === 0} />
            <p className="mt-2 text-xs font-semibold text-slate-500">風險 {mission.riskScore} · {mission.createdAt}</p>
          </div>
        ))}
      </div>
    </Surface>
  );
}

function MissionProgress({status, live}: {status: 'dispatching' | 'arrived' | 'completed'; live: boolean}) {
  const current = status === 'completed' ? 2 : status === 'arrived' ? 1 : 0;
  return (
    <div className="mt-3 grid grid-cols-3 gap-1">
      {MISSION_STEPS.map((step, index) => {
        const active = index <= current || (live && index === Math.min(current + 1, 2));
        return (
          <span key={step} className={`rounded-full px-2 py-1 text-center text-[10px] font-black ${active ? 'bg-teal-100 text-teal-700' : 'bg-white text-slate-400'}`}>
            {step}
          </span>
        );
      })}
    </div>
  );
}

function DispatchProgress({stage, connected, compact = false, className = ''}: {stage?: RobotDispatchStage; connected: boolean; compact?: boolean; className?: string}) {
  const current = getRobotStageIndex(stage);
  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {robotDispatchSteps.map((step, index) => {
        const active = current >= index;
        const waiting = current + 1 === index;
        return (
          <div
            key={step}
            className={`rounded-xl border text-center font-black transition ${compact ? 'px-2 py-2 text-[10px]' : 'px-3 py-2 text-[10px]'} ${
              active
                ? connected && index === 2
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-teal-200 bg-teal-50 text-teal-700'
                : waiting
                  ? 'border-slate-200 bg-white text-slate-500'
                  : 'border-slate-200 bg-slate-50 text-slate-400'
            }`}
          >
            {step}
          </div>
        );
      })}
    </div>
  );
}

function PanelDock({
  activePanel,
  selectedZone,
  robotFeedback,
  teacherCalledZones,
  onOpenPanel,
  onOpenZoneInsight,
  onPrepareManualEvent,
  onDispatchRobot,
}: {
  activePanel: ActivePanel;
  selectedZone: SchoolZoneStatus;
  robotFeedback: RobotDispatchFeedback;
  teacherCalledZones: Record<string, boolean>;
  onOpenPanel: (panel: ActivePanel) => void;
  onOpenZoneInsight: (zone: SchoolZoneStatus) => void;
  onPrepareManualEvent: (zone: SchoolZoneStatus, seedText?: string) => void;
  onDispatchRobot: (zone: SchoolZoneStatus) => void;
}) {
  const teacherCalled = Boolean(teacherCalledZones[selectedZone.id]);
  const idle = isZoneIdle(selectedZone);
  const activeDispatch = robotFeedback?.zoneId === selectedZone.id;
  const statusLabel = getZoneStatusLabel(selectedZone, teacherCalled);
  const canDispatch = !teacherCalled && !idle && selectedZone.riskLevel !== 'low' && !activeDispatch;
  const dockItems: Array<{
    id: Exclude<ActivePanel, null>;
    title: string;
    subtitle: string;
    icon: LucideIcon;
    action: () => void;
  }> = [
    {
      id: 'alerts',
      title: '預警',
      subtitle: '補事件',
      icon: Bell,
      action: () => onPrepareManualEvent(selectedZone),
    },
    {
      id: 'sensing',
      title: '感知',
      subtitle: '聲影',
      icon: Radar,
      action: () => onOpenPanel('sensing'),
    },
    {
      id: 'care',
      title: '照護',
      subtitle: '心情',
      icon: Leaf,
      action: () => onOpenPanel('care'),
    },
  ];

  return (
    <Surface className="overflow-hidden p-3">
      <div className="rounded-xl border border-slate-200/80 bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black tracking-widest text-teal-700 uppercase">現場協作面板</p>
            <h3 className="mt-0.5 truncate text-lg font-black text-slate-950">{selectedZone.name}</h3>
            <p className="mt-0.5 text-[11px] font-bold leading-4 text-slate-500">
              地圖區域 → 證據補充 → 副駕與機器人同步
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ring-1 ${teacherCalled ? 'bg-violet-50 text-violet-700 ring-violet-200' : idle ? 'bg-slate-50 text-slate-600 ring-slate-200' : selectedZone.riskLevel === 'high' ? 'bg-rose-50 text-rose-700 ring-rose-200' : selectedZone.riskLevel === 'medium' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
            {statusLabel}
          </span>
        </div>
        <div className="hidden">
          <MetricTile label="感測" value={getZoneSensorLabel(selectedZone)} />
          <MetricTile label="提醒" value={selectedZone.alertCount} />
          <MetricTile label="機器人" value={activeDispatch ? robotFeedback?.stage ?? '派遣中' : teacherCalled ? '老師接手' : canDispatch ? '可派遣' : '待命'} />
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-slate-100/80 p-1">
        {dockItems.map((item) => {
          const active = activePanel === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.action}
              className={`group min-h-[68px] rounded-xl px-2.5 py-2 text-left transition ${
                active
                  ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-600 hover:bg-white/70 hover:text-slate-950'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 transition ${
                  item.id === 'alerts'
                    ? active ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-white text-rose-600 ring-slate-200'
                    : item.id === 'sensing'
                      ? active ? 'bg-teal-50 text-teal-700 ring-teal-200' : 'bg-white text-teal-700 ring-slate-200'
                      : active ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-white text-emerald-700 ring-slate-200'
                }`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black">{item.title}</p>
                  <p className="mt-0.5 text-[10px] font-bold leading-4 text-slate-500">{item.subtitle}</p>
                </div>
                <span className={`h-2 w-2 shrink-0 rounded-full transition ${active ? 'bg-teal-500' : 'bg-transparent group-hover:bg-slate-300'}`} />
              </div>
            </button>
          );
        })}
      </div>

      <div className={`mt-2 rounded-xl border px-3 py-2 ${teacherCalled ? 'border-violet-200 bg-violet-50' : canDispatch ? 'border-teal-200 bg-teal-50' : 'border-slate-200 bg-slate-50'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-[10px] font-black ${teacherCalled ? 'text-violet-700' : canDispatch ? 'text-teal-700' : 'text-slate-500'}`}>現場決策</p>
            <p className="truncate text-xs font-black text-slate-950">
              {teacherCalled ? '老師已接手，等待現場回報' : canDispatch ? '補證完成後可由老師確認派遣' : idle ? '請先指派感測器位置' : selectedZone.riskLevel === 'low' ? '目前穩定，可進入照護' : '等待目前任務回報'}
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onOpenZoneInsight(selectedZone)}
              disabled={idle}
              className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-black text-slate-600 transition hover:border-teal-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              AI
            </button>
            <button
              type="button"
              onClick={() => onDispatchRobot(selectedZone)}
              disabled={!canDispatch}
              className="min-h-9 rounded-lg bg-teal-600 px-2 text-[10px] font-black text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              派遣
            </button>
          </div>
        </div>
      </div>
    </Surface>
  );
}

function DetailDrawer(props: {
  activePanel: ActivePanel;
  state: GuardianState;
  selectedAlert: GuardianAlert | null;
  setSelectedAlert: (alert: GuardianAlert | null) => void;
  latestMood?: {label: string; createdAt: string};
  selectedMood: MoodType;
  message: string;
  setMessage: (value: string) => void;
  chatBusy: boolean;
  micActive: boolean;
  micError: string;
  currentAcoustic: ReturnType<typeof describeAcousticSignal>;
  acousticLocation: string;
  setAcousticLocation: (value: string) => void;
  proactiveInsight: ProactiveInsight;
  robotFeedback: RobotDispatchFeedback;
  teacherCalledZones: Record<string, boolean>;
  onClose: () => void;
  onMood: (mood: MoodType, note?: string) => void;
  onSendMessage: () => void;
  onStartAcoustic: () => void;
  onRecordAcoustic: (signal: Omit<AcousticSignal, 'id' | 'createdAt'>) => void;
  onCreateAcousticAlert: () => void;
  onCreateProactiveAlert: () => void;
  onSampleSound: () => void;
  onRestartNode: (id: string) => void;
  onDispatchRobot: (zone: SchoolZoneStatus) => void;
  onHardwareCommand: (command: string, source: string) => void;
  dispatch: Dispatch<any>;
  zones: SchoolZoneStatus[];
  selectedZone: SchoolZoneStatus;
  zoneAssessments: Record<string, ZoneInsightAssessment>;
  manualEventZoneId: string;
  manualEventText: string;
  manualEventBusy: boolean;
  manualEventResult: ManualEventResult;
  setManualEventZoneId: (zoneId: string) => void;
  setManualEventText: (value: string) => void;
  setManualEventResult: (value: ManualEventResult) => void;
  onSelectZone: (zone: SchoolZoneStatus) => void;
  onOpenZoneInsight: (zone: SchoolZoneStatus) => void;
  onPrepareManualEvent: (zone: SchoolZoneStatus, seedText?: string) => void;
  onSubmitManualEvent: () => void;
  bridgeOnline: boolean;
  sensors: ZoneSensorReading[];
}) {
  const panel = props.activePanel;
  return (
    <AnimatePresence>
      {panel && (
        <>
          <motion.button
            aria-label="關閉面板"
            className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-sm lg:hidden"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            onClick={props.onClose}
          />
          <motion.aside
            initial={{opacity: 0, x: 40}}
            animate={{opacity: 1, x: 0}}
            exit={{opacity: 0, x: 40}}
            onKeyDown={(e) => e.key === 'Escape' && props.onClose()}
            className="app3-work-drawer fixed inset-x-0 bottom-0 z-50 box-border flex max-h-[88vh] w-screen max-w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white p-3 text-slate-950 shadow-2xl shadow-slate-950/15 sm:max-w-xl sm:p-4 lg:bottom-4 lg:left-4 lg:right-4 lg:top-16 lg:h-auto lg:w-auto lg:max-h-none lg:max-w-none lg:rounded-2xl xl:left-8 xl:right-8"
          >
            <div className="app3-work-header flex items-center justify-between gap-3 border-b border-slate-200 pb-2 lg:pb-3">
              <div>
                <p className="text-xs font-black text-teal-700">工作面板</p>
                <h2 className="text-xl font-black lg:text-2xl">{panelTitle(panel)}</h2>
                <p className="mt-0.5 text-xs font-bold text-slate-500 lg:text-sm">{panelSubtitle(panel)}</p>
              </div>
              <button onClick={props.onClose} aria-label="關閉工作面板" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <PanelLoopContext
              panel={panel}
              selectedZone={props.selectedZone}
              robotFeedback={props.robotFeedback}
              teacherCalledZones={props.teacherCalledZones}
            />
            <div className="app3-work-body min-h-0 min-w-0 flex-1 overflow-y-auto py-3 pb-safe lg:overflow-hidden">
              {panel === 'alerts' && <AlertsPanel {...props} />}
              {panel === 'sensing' && <SensingPanel {...props} />}
              {panel === 'care' && <CarePanel {...props} />}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function PanelLoopContext({
  panel,
  selectedZone,
  robotFeedback,
  teacherCalledZones,
}: {
  panel: Exclude<ActivePanel, null>;
  selectedZone: SchoolZoneStatus;
  robotFeedback: RobotDispatchFeedback;
  teacherCalledZones: Record<string, boolean>;
}) {
  const teacherCalled = Boolean(teacherCalledZones[selectedZone.id]);
  const statusLabel = getZoneStatusLabel(selectedZone, teacherCalled);
  const meta = panel === 'alerts'
    ? {
      step: '地圖區域 → 補事件 → 老師處理',
      outcome: '產生提醒、處理紀錄，必要時派遣機器人。',
      tone: 'border-rose-100 bg-rose-50 text-rose-800',
    }
    : panel === 'sensing'
      ? {
        step: '地圖區域 → 補聲音/影像證據 → 建立提醒',
        outcome: '把現場訊號轉成可追蹤的判斷依據。',
        tone: 'border-teal-100 bg-teal-50 text-teal-800',
      }
      : {
        step: '地圖區域 → 低壓關懷 → 留下照護紀錄',
        outcome: '保護學生隱私，並協助老師銜接關懷。',
        tone: 'border-emerald-100 bg-emerald-50 text-emerald-800',
      };
  return (
    <div className={`app3-loop-context mt-2 rounded-xl border px-3 py-2.5 ${meta.tone}`}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p className="text-xs font-black">
            目前區域：{selectedZone.name} · {statusLabel}
          </p>
          <p className="mt-1 text-xs font-bold leading-5 opacity-80">{meta.step}</p>
        </div>
        <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-black text-slate-600 ring-1 ring-white/70">
          {teacherCalled ? '老師接手中' : robotFeedback?.zoneId === selectedZone.id ? robotFeedback.stage : '等待操作'}
        </span>
      </div>
      <p className="app3-loop-outcome mt-2 text-xs font-bold leading-5 opacity-85">{meta.outcome}</p>
    </div>
  );
}

function AlertsPanel(props: Parameters<typeof DetailDrawer>[0]) {
  const {state, selectedAlert, setSelectedAlert, dispatch, onHardwareCommand} = props;
  const {openCount, processingCount, highCount} = useMemo(() => {
    let open = 0, processing = 0, high = 0;
    for (const a of state.alerts) {
      if (a.status !== 'resolved') { open++; if (a.riskLevel === 'high') high++; }
      if (a.status === 'processing') processing++;
    }
    return {openCount: open, processingCount: processing, highCount: high};
  }, [state.alerts]);
  return (
    <div className="app3-alerts-panel grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
      <section className="grid min-h-0 gap-3">
        <div className="app3-alert-rhythm rounded-2xl border border-teal-100 bg-teal-50/70 p-3 lg:p-4">
          <p className="text-xs font-black tracking-widest text-teal-700 uppercase">處理節奏</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {['1 補現場事件', '2 AI 分級整理', '3 老師確認處理'].map((step) => (
              <div key={step} className="rounded-xl bg-white px-3 py-3 text-sm font-black text-slate-800 shadow-sm">
                {step}
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm font-bold leading-6 text-slate-600">這裡只負責建立提醒和處理提醒，不會自動移動機器人。</p>
        </div>
        <ManualEventComposer
          zones={props.zones}
          manualEventZoneId={props.manualEventZoneId}
          manualEventText={props.manualEventText}
          manualEventBusy={props.manualEventBusy}
          manualEventResult={props.manualEventResult}
          onSelectZone={(zoneId) => {
            props.setManualEventZoneId(zoneId);
            const zone = props.zones.find((item) => item.id === zoneId);
            if (zone) props.onSelectZone(zone);
          }}
          onTextChange={(value) => {
            props.setManualEventText(value);
            props.setManualEventResult(null);
          }}
          onApplyTemplate={(template) => {
            props.setManualEventZoneId(template.zoneId);
            props.setManualEventText(template.text);
            props.setManualEventResult(null);
            const zone = props.zones.find((item) => item.id === template.zoneId);
            if (zone) props.onSelectZone(zone);
          }}
          onSubmit={props.onSubmitManualEvent}
        />
      </section>

      <section className="grid min-h-0 gap-3 xl:grid-rows-[auto_minmax(0,1fr)]">
        <div className="grid grid-cols-3 gap-2">
          <MetricTile label="待處理" value={openCount} />
          <MetricTile label="高優先" value={highCount} />
          <MetricTile label="處理中" value={processingCount} />
        </div>
        <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="app3-alert-list min-h-0 space-y-3 overflow-y-auto pr-1">
            {state.alerts.length === 0 && (
              <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-400">目前無待處理提醒</p>
            )}
            {state.alerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} onOpen={() => setSelectedAlert(alert)} />
            ))}
          </div>
          <div className="app3-alert-detail min-h-[18rem] rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 lg:p-4">
            {selectedAlert ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-black tracking-widest text-teal-600 uppercase">老師處理區</p>
                  <button
                    type="button"
                    onClick={() => setSelectedAlert(null)}
                    className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-500 transition hover:bg-slate-200"
                  >
                    收合
                  </button>
                </div>
                <AlertDetail alert={selectedAlert} dispatch={dispatch} onHardwareCommand={onHardwareCommand} />
              </>
            ) : (
              <div className="flex h-full min-h-[18rem] flex-col items-center justify-center rounded-xl bg-slate-50 px-6 text-center">
                <Bell className="h-8 w-8 text-slate-300" />
                <p className="mt-3 text-lg font-black text-slate-700">選一則提醒處理</p>
                <p className="mt-1 text-sm font-bold leading-6 text-slate-400">先補事件，再選提醒，最後由老師確認處理方式。</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

const TREND_LS_KEY = 'guardian-sound-trend:v1';
const MAX_SAMPLES = 180; // 30 min @ 10s interval

function loadTrend(): {t: number; v: number}[] {
  try {
    const raw = localStorage.getItem(TREND_LS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) { localStorage.removeItem(TREND_LS_KEY); return []; }
    return parsed.filter((p): p is {t: number; v: number} =>
      p !== null && typeof p === 'object' && typeof (p as Record<string,unknown>).t === 'number' && typeof (p as Record<string,unknown>).v === 'number'
    );
  } catch {
    return [];
  }
}

function SoundSparkline({trend}: {trend: {t: number; v: number}[]}) {
  if (trend.length < 2) {
    return <p className="mt-3 text-xs font-bold text-slate-400">趨勢資料收集中，麥克風啟用後每 10 秒記錄一次…</p>;
  }
  const W = 280;
  const H = 48;
  const vals = trend.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals) || 1;
  const range = max - min || 1;
  const toX = (i: number) => (i / (trend.length - 1)) * W;
  const toY = (v: number) => H - ((v - min) / range) * (H - 4) - 2;
  const points = trend.map((p, i) => `${toX(i).toFixed(1)},${toY(p.v).toFixed(1)}`).join(' ');
  const last3 = vals.slice(-3);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const first3 = vals.slice(0, 3);
  const trend3 = last3.length >= 2 ? avg(last3) - avg(first3) : 0;
  const trendArrow = trend3 > 5 ? '↑ 上升' : trend3 < -5 ? '↓ 下降' : '→ 穩定';
  const trendColor = trend3 > 5 ? 'text-rose-500' : trend3 < -5 ? 'text-emerald-600' : 'text-slate-500';
  const latest = vals[vals.length - 1];
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-black text-slate-500">過去 {Math.round(trend.length * 10 / 60)} 分鐘聲量趨勢</p>
        <span className={`text-xs font-black ${trendColor}`}>{trendArrow}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{height: 48}}>
        <polyline fill="none" stroke="#0d9488" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={points} />
        <circle cx={toX(trend.length - 1)} cy={toY(latest)} r="3" fill="#0d9488" />
      </svg>
      <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1">
        <span>{trend.length * 10 >= 60 ? `${Math.round(trend.length * 10 / 60)} 分前` : `${trend.length * 10} 秒前`}</span>
        <span>現在 {latest}</span>
      </div>
    </div>
  );
}

function AcousticNeedleMeter({signal, active}: {signal: ReturnType<typeof describeAcousticSignal>; active: boolean}) {
  const volume = Math.max(0, Math.min(100, Number(signal.volumeIndex) || 0));
  const volatility = Math.max(0, Math.min(100, Number(signal.volatility) || 0));
  const angle = -68 + (volume / 100) * 136;
  const status = signal.level === 'elevated'
    ? {label: '偏高', color: '#f43f5e', soft: 'bg-rose-50 text-rose-700 ring-rose-100'}
    : signal.level === 'active'
      ? {label: '活動', color: '#f59e0b', soft: 'bg-amber-50 text-amber-700 ring-amber-100'}
      : {label: '平穩', color: '#0d9488', soft: 'bg-teal-50 text-teal-700 ring-teal-100'};
  const bars = Array.from({length: 18}, (_, index) => {
    const threshold = ((index + 1) / 18) * 100;
    const lit = volume >= threshold;
    const height = 18 + ((index % 6) * 7) + Math.min(18, volatility / 4);
    return {height, lit};
  });

  return (
    <div className="app3-acoustic-meter mt-3 overflow-hidden rounded-xl border border-slate-200/80 bg-linear-to-br from-slate-950 via-slate-900 to-teal-950 p-3 text-white shadow-sm lg:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black tracking-[0.22em] text-cyan-200 uppercase">Live Audio</p>
          <p className="mt-1 text-sm font-black text-white">環境聲音指針</p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-[10px] font-black ring-1 ${status.soft}`}>{active ? '即時監測' : '本機樣本'} · {status.label}</span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center">
        <div className="relative mx-auto h-32 w-40">
          <div className="absolute inset-x-2 bottom-0 h-20 rounded-t-full border-x border-t border-white/15 bg-white/8" />
          <div className="absolute inset-x-4 bottom-2 h-16 rounded-t-full border-x border-t border-cyan-300/30" />
          <div className="absolute left-1/2 top-7 h-20 w-1 origin-bottom rounded-full bg-white shadow-lg shadow-cyan-300/30 transition-transform duration-500 ease-out" style={{transform: `translateX(-50%) rotate(${angle}deg)`}} />
          <div className="absolute bottom-5 left-1/2 h-5 w-5 -translate-x-1/2 rounded-full border border-white/30 bg-white shadow-md" />
          <div className="absolute bottom-4 left-4 text-[10px] font-black text-white/45">0</div>
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-[10px] font-black text-cyan-100">50</div>
          <div className="absolute bottom-4 right-2 text-[10px] font-black text-white/45">100</div>
          <div className="absolute inset-x-0 bottom-0 text-center">
            <span className="text-4xl font-black leading-none">{volume}</span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex h-24 items-end gap-1.5 rounded-xl border border-white/10 bg-white/8 px-3 pb-3">
            {bars.map((bar, index) => (
              <span
                key={index}
                className={`audio-bar flex-1 rounded-full transition-colors ${bar.lit ? 'bg-cyan-300' : 'bg-white/20'}`}
                style={{
                  height: `${bar.height}%`,
                  animationDelay: `${index * 70}ms`,
                  opacity: bar.lit ? 1 : 0.42,
                }}
              />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-white/8 p-3">
              <p className="text-[10px] font-black text-white/45">波動</p>
              <p className="mt-1 text-xl font-black text-white">{volatility}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/8 p-3">
              <p className="text-[10px] font-black text-white/45">指標</p>
              <p className="mt-1 text-xl font-black" style={{color: status.color}}>{status.label}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SensingPanel({
  micActive,
  micError,
  currentAcoustic,
  acousticLocation,
  setAcousticLocation,
  proactiveInsight,
  onStartAcoustic,
  onRecordAcoustic,
  onCreateAcousticAlert,
  onCreateProactiveAlert,
  onSampleSound,
}: Parameters<typeof DetailDrawer>[0]) {
  const [visualResult, setVisualResult] = useState<VisualPrivacyResult>(() => analyzePrivacyFrame(1, 1, new Uint8ClampedArray([180, 180, 180, 255])));
  const [visualCameraReady, setVisualCameraReady] = useState(false);
  const [visualBusy, setVisualBusy] = useState(false);
  const [visualError, setVisualError] = useState('');
  const [visualAnalyzedAt, setVisualAnalyzedAt] = useState('尚未判讀');
  const visualVideoRef = useRef<HTMLVideoElement | null>(null);
  const visualCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualStreamRef = useRef<MediaStream | null>(null);
  const [soundTrend, setSoundTrend] = useState<{t: number; v: number}[]>(loadTrend);
  const acousticRef = useRef(currentAcoustic);

  useEffect(() => { acousticRef.current = currentAcoustic; }, [currentAcoustic]);

  useEffect(() => () => {
    visualStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!micActive) return;
    const id = setInterval(() => {
      setSoundTrend((prev) => {
        const next = [...prev, {t: Date.now(), v: acousticRef.current.volumeIndex}].slice(-MAX_SAMPLES);
        try { localStorage.setItem(TREND_LS_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
    }, 10_000);
    return () => clearInterval(id);
  }, [micActive]);

  const toggleVisualCamera = async () => {
    if (visualCameraReady) {
      visualStreamRef.current?.getTracks().forEach((track) => track.stop());
      visualStreamRef.current = null;
      setVisualCameraReady(false);
      return;
    }
    try {
      setVisualBusy(true);
      setVisualError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: {ideal: 'environment'}, width: {ideal: 960}, height: {ideal: 540}},
        audio: false,
      });
      visualStreamRef.current = stream;
      if (visualVideoRef.current) {
        visualVideoRef.current.srcObject = stream;
        await visualVideoRef.current.play();
      }
      setVisualCameraReady(true);
    } catch {
      visualStreamRef.current?.getTracks().forEach((track) => track.stop());
      visualStreamRef.current = null;
      setVisualError('無法開啟攝影機，請確認瀏覽器權限。');
    } finally {
      setVisualBusy(false);
    }
  };

  const analyzeVisualFrame = () => {
    const video = visualVideoRef.current;
    const canvas = visualCanvasRef.current;
    if (!video || !canvas || !visualCameraReady) return;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 360;
    const maxSide = 180;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', {willReadFrequently: true});
    if (!context) return;
    setVisualBusy(true);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    setVisualResult(analyzePrivacyFrame(frame.width, frame.height, frame.data));
    setVisualAnalyzedAt(new Intl.DateTimeFormat('zh-TW', {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false}).format(new Date()));
    setVisualBusy(false);
  };

  return (
    <div className="app3-sensing-panel grid min-w-0 gap-3 xl:grid-cols-3">
      <GlassPanel className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-linear-to-r from-teal-400 via-cyan-300 to-emerald-400" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black tracking-[0.2em] text-teal-700 uppercase">本機即時運算</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">環境聲量感知</h3>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">即時音量只轉成指標，不保留原始聲音。</p>
          </div>
          <button onClick={onStartAcoustic} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-black text-white shadow-sm transition active:scale-[0.98] ${micActive ? 'bg-slate-950 shadow-slate-200' : 'bg-teal-600 shadow-teal-200 hover:bg-teal-700'}`}>
            {micActive ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            <span className="hidden sm:inline">{micActive ? '停止麥克風' : '啟用麥克風'}</span>
          </button>
        </div>
        {micError && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{micError}</p>}
        <AcousticNeedleMeter signal={currentAcoustic} active={micActive} />
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MiniMetric label="音量" value={currentAcoustic.volumeIndex} />
          <MiniMetric label="波動" value={currentAcoustic.volatility} />
          <MiniMetric label="狀態" value={currentAcoustic.level === 'elevated' ? '偏高' : currentAcoustic.level === 'active' ? '活動' : '平穩'} />
        </div>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{currentAcoustic.summary}</p>
        <SoundSparkline trend={soundTrend} />
        <input value={acousticLocation} onChange={(event) => setAcousticLocation(event.target.value)} aria-label="感測位置" placeholder="例：穿堂、教室等位置" className="mt-3 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <button onClick={() => onRecordAcoustic({source: micActive ? 'microphone' : 'demo', location: acousticLocation, ...currentAcoustic})} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-700">
            記錄
          </button>
          <button onClick={onCreateAcousticAlert} className="rounded-xl bg-teal-600 px-3 py-3 text-xs font-black text-white">
            建立提醒
          </button>
          <button
            onClick={() => {
              onSampleSound();
              const now = Date.now();
              const sample = Array.from({length: 25}, (_, i) => ({
                t: now - (24 - i) * 10_000,
                v: Math.round(18 + Math.sin(i * 0.55) * 20 + Math.max(0, i - 12) * 2.5),
              }));
              setSoundTrend(sample);
              try { localStorage.setItem(TREND_LS_KEY, JSON.stringify(sample)); } catch {}
            }}
            className="rounded-xl bg-slate-100 px-3 py-3 text-xs font-black text-slate-700"
          >
            帶入樣本
          </button>
        </div>
      </GlassPanel>

      <GlassPanel className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-linear-to-r from-slate-700 via-slate-400 to-teal-300" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black tracking-[0.2em] text-slate-500 uppercase">隱私影像感知</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">場域風險辨識</h3>
            <p className="mt-1 text-xs font-bold text-slate-400">最近判讀：{visualAnalyzedAt}</p>
          </div>
          <button onClick={toggleVisualCamera} disabled={visualBusy} className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50">
            <Camera className="h-5 w-5" />
            <span className="hidden sm:inline">{visualCameraReady ? '關閉' : '啟用'}</span>
          </button>
        </div>
        <div className="app3-visual-preview mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
          <div className="relative aspect-video">
            <video ref={visualVideoRef} muted playsInline className={`h-full w-full object-cover ${visualCameraReady ? 'opacity-100' : 'opacity-20'}`} />
            {!visualCameraReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/65">
                <Camera className="h-8 w-8" />
                <p className="text-xs font-black">攝影機待啟用</p>
              </div>
            )}
            <canvas ref={visualCanvasRef} className="hidden" />
          </div>
        </div>
        {visualError && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{visualError}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniMetric label="風險" value={visualResult.score} />
          <MiniMetric label="紋理" value={visualResult.metrics.crowdTexture} />
          <MiniMetric label="低光" value={visualResult.metrics.lowLightArea} />
          <MiniMetric label="狀態" value={visualResult.level === 'support' ? '關注' : visualResult.level === 'watch' ? '觀察' : '穩定'} />
        </div>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{visualResult.summary}</p>
        <div className={`mt-3 rounded-xl border px-4 py-3 text-xs font-bold leading-5 ${
          visualResult.quality.level === 'good'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : visualResult.quality.level === 'warn'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
        }`}>
          <span className="font-black">畫面品質 · {visualResult.quality.label}</span>
          <span className="ml-2">{visualResult.quality.hints[0] ?? '環境畫面可用，系統只做低解析場域分析。'}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {visualResult.evidence.map((item) => (
            <span key={item} className="rounded-full bg-teal-50 px-3 py-1 text-[10px] font-black text-teal-700">{item}</span>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={analyzeVisualFrame} disabled={!visualCameraReady || visualBusy} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-700 disabled:opacity-50">
            {visualBusy ? '判讀中' : '擷取判讀'}
          </button>
          <button onClick={onCreateProactiveAlert} className="rounded-xl bg-teal-600 px-3 py-3 text-xs font-black text-white">
            建立關懷提醒
          </button>
        </div>
      </GlassPanel>

      <GlassPanel className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-linear-to-r from-emerald-400 via-teal-400 to-cyan-300" />
        <p className="text-[10px] font-black tracking-[0.2em] text-emerald-700 uppercase">AI 融合分析</p>
        <h3 className="mt-1 text-xl font-black text-slate-950">{proactiveInsight.title}</h3>
        <p className="mt-1 text-xs font-semibold text-slate-400">融合分數 {proactiveInsight.score}/10 · {proactiveInsight.score >= 7 ? '高風險' : proactiveInsight.score >= 4 ? '中風險' : '低風險'}</p>
        <div className="mt-3 space-y-1.5">
          {proactiveInsight.signals.map(({label, score: s, max}) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-16 text-[10px] font-black text-slate-500">{label}</span>
              <div className="flex flex-1 gap-0.5">
                {Array.from({length: max}).map((_, i) => (
                  <div key={i} className={`h-2 flex-1 rounded-full ${i < s ? (s === max ? 'bg-rose-400' : 'bg-amber-400') : 'bg-slate-200'}`} />
                ))}
              </div>
              <span className="w-8 text-right text-[10px] font-black text-slate-400">{s}/{max}</span>
            </div>
          ))}
        </div>
        <button onClick={onCreateProactiveAlert} className="mt-4 min-h-11 w-full rounded-xl bg-slate-950 text-sm font-black text-white">
          由多來源訊號建立提醒
        </button>
      </GlassPanel>
    </div>
  );
}

function CarePanel({
  state,
  latestMood,
  selectedMood,
  onMood,
  message,
  setMessage,
  onSendMessage,
  chatBusy,
}: Parameters<typeof DetailDrawer>[0]) {
  const [counselingInfoVisible, setCounselingInfoVisible] = useState(false);
  const [emotionText, setEmotionText] = useState('今天考試有點壓力，但我想慢慢整理。');
  const [emotionResult, setEmotionResult] = useState(() => analyzeEmotionTypography('今天考試有點壓力，但我想慢慢整理。'));
  const runEmotionTypography = () => {
    setEmotionResult(analyzeEmotionTypography(emotionText));
  };
  return (
    <div className="app3-care-panel grid min-h-0 gap-3 xl:grid-cols-3">
      <GlassPanel>
        <h3 className="text-xl font-black text-slate-950">心情簽到</h3>
        <p className="mt-1 text-sm font-semibold text-slate-400">最近一次：{latestMood?.label ?? '尚未簽到'} · {latestMood?.createdAt ?? '今天'}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {moodOptions.map((item) => (
            <button key={item.mood} onClick={() => onMood(item.mood)} className={`app3-mood-button min-h-20 rounded-xl border p-3 text-left lg:min-h-24 ${selectedMood === item.mood ? item.tone : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
              <Smile className="h-5 w-5" />
              <span className="mt-2 block font-black">{item.label}</span>
              <span className="mt-1 block text-xs font-semibold opacity-75">{item.note}</span>
            </button>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black text-teal-700">情緒字體</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">文字心情辨識</h3>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <Type className="h-5 w-5" />
          </div>
        </div>
        <textarea
          value={emotionText}
          onChange={(event) => setEmotionText(event.target.value)}
          maxLength={240}
          aria-label="情緒文字"
          className="app3-emotion-textarea mt-3 min-h-20 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 lg:min-h-24 lg:p-4"
          placeholder="輸入匿名句子..."
        />
        <div className="app3-emotion-result mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black text-slate-400">辨識狀態</p>
              <p className="mt-1 text-sm font-black text-slate-950">{emotionResult.label}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-teal-700 shadow-sm">{emotionResult.intensity}%</span>
          </div>
          <p className={`mt-3 rounded-xl bg-white px-3 py-2 text-base leading-7 lg:text-lg lg:leading-8 ${emotionResult.fontClass}`}>{emotionResult.preview}</p>
          <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{emotionResult.guidance}</p>
          {emotionResult.keywords.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {emotionResult.keywords.map((keyword) => (
                <span key={keyword} className="rounded-full bg-teal-50 px-3 py-1 text-[10px] font-black text-teal-700">{keyword}</span>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={runEmotionTypography} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
            重新辨識
          </button>
          <button
            onClick={() => onMood(emotionResult.mood, `情緒字體：${emotionResult.label}｜${emotionResult.preview}`)}
            className="min-h-11 rounded-xl bg-teal-600 px-3 text-xs font-black text-white"
          >
            加入簽到
          </button>
        </div>
      </GlassPanel>

      <GlassPanel>
        <h3 className="text-xl font-black text-slate-950">安全空間聊天</h3>
        <div className="app3-care-chat mt-3 flex h-80 flex-col rounded-xl border border-slate-200 bg-slate-50">
          <ChatScrollContainer messages={state.supportMessages}>
            {state.supportMessages.map((item, index) => (
              item.role === 'student' ? (
                <div key={item.id} className="ml-auto max-w-[86%] rounded-xl px-4 py-3 text-sm font-semibold leading-6 bg-teal-600 text-white wrap-break-word">
                  {item.content}
                </div>
              ) : (
                <div key={item.id} className="max-w-[86%]">
                  <div className="flex items-start gap-2">
                    <div className="shrink-0 w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center text-sm">
                      🤝
                    </div>
                    <div className="border border-teal-200 bg-teal-50 text-slate-700 rounded-xl px-3 py-2 text-sm font-semibold leading-6 flex-1 wrap-break-word">
                      {item.content}
                    </div>
                  </div>
                  {index > 0 && isCrisisMessage(state.supportMessages[index - 1]?.content ?? '') && (
                    <div className="mt-2 ml-9 rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
                      <p className="font-semibold text-red-700 mb-2">🆘 需要立即幫助？</p>
                      <div className="flex flex-col gap-1.5">
                        <a
                          href="tel:1925"
                          className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-white font-medium hover:bg-red-700 transition-colors"
                        >
                          📞 撥打安心專線 1925
                        </a>
                        <button
                          type="button"
                          className="flex items-center gap-2 rounded-lg bg-white border border-red-300 px-3 py-2 text-red-700 font-medium hover:bg-red-50 transition-colors"
                          onClick={() => setCounselingInfoVisible((v) => !v)}
                        >
                          🏫 前往輔導室尋求幫助
                        </button>
                        {counselingInfoVisible && (
                          <p className="rounded-lg bg-white border border-red-200 px-3 py-2 text-xs text-red-700 font-medium">
                            輔導室在教學大樓 2 樓，老師隨時歡迎你來談談。
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            ))}
            {chatBusy && <div className="w-fit rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-500 animate-pulse">守護者正在回覆中...</div>}
          </ChatScrollContainer>
          <div className="flex gap-2 border-t border-slate-200 p-3">
            <div className="flex flex-col flex-1">
              <input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && !chatBusy && !!message.trim() && onSendMessage()} maxLength={300} aria-label="心情輸入" className="min-h-11 w-full rounded-xl bg-white px-4 text-sm font-semibold outline-none focus:ring-2 focus:ring-teal-100" placeholder="輸入今天想說的心情..." />
              <p className="text-right text-xs text-gray-400 mt-0.5">{message.length} / 300</p>
            </div>
            <button onClick={onSendMessage} disabled={chatBusy || !message.trim()} aria-label="傳送訊息" className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

function NodesPanel({state, zones, robotFeedback, onRestartNode, onDispatchRobot, onSelectZone, onOpenZoneInsight}: Parameters<typeof DetailDrawer>[0]) {
  return (
    <div className="space-y-4">
      <GlassPanel>
        <h3 className="text-xl font-black text-slate-950">校園空間</h3>
        <div className="mt-4 space-y-2">
          {zones.map((zone) => (
            <div
              key={zone.id}
              onClick={() => onSelectZone(zone)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelectZone(zone);
              }}
              className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-left transition active:scale-[0.99] ${
                robotFeedback?.zoneId === zone.id
                  ? 'border-teal-200 bg-teal-50 shadow-sm shadow-teal-100'
                  : isZoneIdle(zone) || zone.riskLevel === 'low'
                    ? 'border-slate-200 bg-slate-50 opacity-75'
                    : 'border-slate-200 bg-slate-50 hover:border-teal-200 hover:bg-teal-50'
              }`}
            >
              <span>
                <span className="block font-black text-slate-950">{zone.name}</span>
                <span className="text-xs font-semibold text-slate-500">
                  {isZoneIdle(zone) ? '待機' : robotFeedback?.zoneId === zone.id ? '派遣確認中' : zone.riskLevel === 'low' ? '維持巡查' : '可派遣'} · {getZoneStatusLabel(zone)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {!isZoneIdle(zone) && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenZoneInsight(zone);
                    }}
                    className="rounded-lg bg-white px-2 py-1 text-[10px] font-black text-slate-600 ring-1 ring-slate-200"
                  >
                    判讀
                  </button>
                )}
                {!isZoneIdle(zone) && zone.riskLevel !== 'low' && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDispatchRobot(zone);
                    }}
                    disabled={robotFeedback?.zoneId === zone.id}
                    className="rounded-lg bg-teal-600 px-2 py-1 text-[10px] font-black text-white disabled:bg-slate-300"
                  >
                    派遣
                  </button>
                )}
                {robotFeedback?.zoneId === zone.id && <Bot className="h-4 w-4 animate-pulse text-teal-700" />}
                <RiskBadge level={zone.riskLevel} />
              </span>
            </div>
          ))}
        </div>
      </GlassPanel>
      <GlassPanel>
        <h3 className="text-xl font-black text-slate-950">節點狀態</h3>
        <div className="mt-4 space-y-3">
          {state.nodes.length === 0 && (
            <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-5 text-center text-sm font-semibold text-slate-400">尚無節點</p>
          )}
          {state.nodes.map((node) => (
            <NodeRow key={node.id} node={node} onRestart={() => onRestartNode(node.id)} />
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}

function LogsPanel({state, robotFeedback}: Parameters<typeof DetailDrawer>[0]) {
  const latestHardware = state.hardwareEvents[0];
  return (
    <div className="space-y-4">
      <GlassPanel>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black text-slate-500">連動狀態</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">{robotFeedback ? `${robotFeedback.zoneName} 派遣中` : latestHardware?.status === 'sent' ? '硬體已接收' : '智慧派遣就緒'}</h3>
          </div>
          <Bot className={`h-6 w-6 ${robotFeedback ? 'animate-pulse text-teal-700' : 'text-slate-400'}`} />
        </div>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          {latestHardware?.status === 'sent' ? '已送到橋接服務；接上實體機器人後會走同一條指令路徑。' : '目前尚未連到實體機器人，但派遣、任務紀錄與操作紀錄都會完整保留。'}
        </p>
      </GlassPanel>
      <GlassPanel>
        <h3 className="text-xl font-black text-slate-950">硬體提示紀錄</h3>
        <div className="mt-4 space-y-3">
          {state.hardwareEvents.length === 0 && (
            <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-5 text-center text-sm font-semibold text-slate-400">尚無硬體事件</p>
          )}
          {state.hardwareEvents.slice(0, 8).map((event) => (
            <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate font-black text-slate-950" title={event.command}>{event.command}</p>
                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${event.status === 'sent' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'}`}>
                  {event.status === 'sent' ? '已送' : '備援'}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500">{event.source} · {event.createdAt}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{event.message}</p>
            </div>
          ))}
        </div>
      </GlassPanel>
      <GlassPanel>
        <h3 className="text-xl font-black text-slate-950">支援方案</h3>
        <div className="mt-4 space-y-3">
          {state.interventions.slice(0, 6).map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="font-black text-slate-950">{item.title}</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{item.description}</p>
              <p className="mt-2 text-xs font-black text-teal-700">{item.area} · {item.updatedAt}</p>
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}

function FrontendPairingModal({
  open,
  clientCount,
  onClientCountChange,
  onClose,
}: {
  open: boolean;
  clientCount: number;
  onClientCountChange: (count: number) => void;
  onClose: () => void;
}) {
  const [clients, setClients] = useState<RobotDisplayClient[]>([]);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [pairingUrl, setPairingUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [copied, setCopied] = useState(false);

  const refreshClients = useCallback(async () => {
    const status = await fetchRobotDisplayStatus();
    setClients(status.displays);
    onClientCountChange(status.clients);
  }, [onClientCountChange]);

  const generatePairingQr = useCallback(async () => {
    setLoadingQr(true);
    try {
      const info = await fetchRobotDisplayPairingInfo();
      const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
      const bridgeRobotUrl = info?.robotDisplayUrl && !/:3000\b/.test(info.robotDisplayUrl)
        ? info.robotDisplayUrl
        : '';
      const displayHostname = isLocalHost && info?.ip ? info.ip : window.location.hostname;
      const fallbackPort = window.location.port || String(info?.vitePort || '');
      const fallbackOrigin = `${window.location.protocol}//${displayHostname}${fallbackPort ? `:${fallbackPort}` : ''}`;
      const pairing = new URL(bridgeRobotUrl || '/robot-display.html', bridgeRobotUrl || fallbackOrigin);
      if (pairing.protocol !== 'https:') {
        pairing.searchParams.set('bridge', `${displayHostname}:${info?.bridgePort ?? 3203}`);
      } else {
        pairing.searchParams.delete('bridge');
      }
      pairing.searchParams.set('pair', Date.now().toString(36));
      const url = pairing.toString();
      setPairingUrl(url);
      const {default: QRCode} = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(url, {
        width: 420,
        margin: 2,
        color: {dark: '#0f766e', light: '#ffffff'},
      });
      setQrSrc(dataUrl);
    } finally {
      setLoadingQr(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshClients();
    void generatePairingQr();
    const timer = window.setInterval(() => void refreshClients(), 2500);
    return () => window.clearInterval(timer);
  }, [generatePairingQr, open, refreshClients]);

  const copyPairingUrl = useCallback(() => {
    if (!pairingUrl) return;
    void navigator.clipboard.writeText(pairingUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  }, [pairingUrl]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
        >
          <motion.div
            className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200"
            initial={{opacity: 0, y: 18, scale: 0.98}}
            animate={{opacity: 1, y: 0, scale: 1}}
            exit={{opacity: 0, y: 18, scale: 0.98}}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-lg shadow-teal-200">
                  <QrCode className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black tracking-[0.22em] text-teal-700 uppercase">Frontend Pairing</p>
                  <h2 className="text-xl font-black text-slate-950">前端配對</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
                aria-label="關閉前端配對"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid max-h-[calc(92vh-5rem)] gap-0 overflow-y-auto lg:grid-cols-[1fr_0.9fr]">
              <section className="border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-500">掃描後開啟機器人前端</p>
                    <p className="text-xs font-bold text-slate-400">iPad 或手機需與中控在同一個 WiFi</p>
                  </div>
                  <button
                    type="button"
                    onClick={generatePairingQr}
                    disabled={loadingQr}
                    className="flex min-h-10 items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-black text-teal-700 transition hover:bg-teal-100 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingQr ? 'animate-spin' : ''}`} />
                    更新 QR
                  </button>
                </div>

                <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  {qrSrc ? (
                    <img src={qrSrc} alt="前端配對 QR Code" className="h-72 w-72 max-w-full rounded-2xl border border-slate-100 bg-white p-2 shadow-sm" />
                  ) : (
                    <div className="flex h-72 w-72 max-w-full items-center justify-center rounded-2xl bg-slate-50 text-sm font-black text-slate-400">
                      QR code 產生中
                    </div>
                  )}
                  <p className="mt-3 w-full break-all rounded-xl bg-slate-50 px-3 py-2 text-center font-mono text-[11px] font-bold leading-5 text-slate-500">
                    {pairingUrl ?? '正在取得中控連線網址'}
                  </p>
                  <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-[11px] font-black leading-5 text-amber-700 ring-1 ring-amber-200">
                    iPad/手機若要使用相機與麥克風，網址應為 HTTPS 配對入口；如果看到 :3000 或 APP2 畫面，請按「更新 QR」。
                  </p>
                  <div className="mt-3 flex w-full flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={copyPairingUrl}
                      disabled={!pairingUrl}
                      className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:border-teal-200 hover:text-teal-700 disabled:opacity-50"
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      {copied ? '已複製' : '複製連結'}
                    </button>
                    <a
                      href={pairingUrl ?? '/robot-display.html'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-black text-white transition hover:bg-teal-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                      開啟前端
                    </a>
                  </div>
                </div>
              </section>

              <section className="bg-slate-50 p-5">
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-teal-200 bg-white p-4">
                    <p className="text-[10px] font-black tracking-[0.2em] text-teal-700 uppercase">Connected</p>
                    <p className="mt-1 text-4xl font-black text-teal-700">{clientCount}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-black tracking-[0.2em] text-slate-500 uppercase">Status</p>
                    <div className="mt-3 flex items-center gap-2">
                      {clientCount > 0 ? <Wifi className="h-5 w-5 text-emerald-600" /> : <WifiOff className="h-5 w-5 text-slate-400" />}
                      <span className={`text-sm font-black ${clientCount > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {clientCount > 0 ? '前端在線' : '等待掃碼'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-black tracking-widest text-slate-500 uppercase">已連線前端</p>
                    <button
                      type="button"
                      onClick={() => void refreshClients()}
                      className="flex h-9 items-center gap-1 rounded-xl bg-slate-50 px-3 text-[10px] font-black text-slate-500 transition hover:bg-teal-50 hover:text-teal-700"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      重新整理
                    </button>
                  </div>

                  {clients.length === 0 ? (
                    <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center">
                      <Smartphone className="mb-2 h-8 w-8 text-slate-300" />
                      <p className="text-sm font-black text-slate-500">尚無前端連線</p>
                      <p className="mt-1 text-xs font-bold text-slate-400">使用 iPad 或手機掃描左側 QR code</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {clients.map((client, index) => (
                        <div key={client.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                              <Smartphone className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-black text-slate-800">前端 {index + 1}</p>
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">已連線</span>
                              </div>
                              <p className="mt-1 truncate font-mono text-[11px] font-bold text-slate-500">{client.ip}</p>
                              <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-4 text-slate-400">{describeClientDevice(client.userAgent)}</p>
                              <p className="mt-2 text-[10px] font-black text-slate-400">連線 {formatClientTime(client.connectedAt)} · 最後回應 {formatClientTime(client.lastSeen)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function describeClientDevice(userAgent: string): string {
  const ua = userAgent || '';
  if (/iPad/i.test(ua)) return 'iPad Safari';
  if (/iPhone/i.test(ua)) return 'iPhone Safari';
  if (/Android/i.test(ua)) return 'Android 瀏覽器';
  if (/Macintosh/i.test(ua) && /Safari/i.test(ua)) return 'Mac / Safari';
  if (/Chrome/i.test(ua)) return 'Chrome 瀏覽器';
  return ua === 'unknown' ? '未知前端' : ua;
}

function formatClientTime(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '剛剛';
  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(time);
}

function Toast({message}: {message: string | null}) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{opacity: 0, y: -16, x: '-50%'}}
          animate={{opacity: 1, y: 0, x: '-50%'}}
          exit={{opacity: 0, y: -16, x: '-50%'}}
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-20 z-80 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-2xl border border-cyan-200/30 bg-slate-950/90 px-4 py-3 text-sm font-black text-white shadow-xl backdrop-blur"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-cyan-200" />
          <span className="truncate">{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CooldownText({zoneId, cooldowns, now, compact = false}: {zoneId: string; cooldowns: Record<string, number>; now: number; compact?: boolean}) {
  const remaining = Math.ceil(((cooldowns[zoneId] ?? 0) - now) / 1000);
  if (remaining <= 0) return null;
  return (
    <p className={`${compact ? 'mt-0.5 text-[10px]' : 'mt-1 text-xs'} font-black text-amber-600`}>
      冷卻倒數 {remaining}s
    </p>
  );
}

function TeacherCalledText({zoneId, teacherCalledZones, compact = false}: {zoneId: string; teacherCalledZones: Record<string, boolean>; compact?: boolean}) {
  if (!teacherCalledZones[zoneId]) return null;
  return (
    <p className={`${compact ? 'mt-0.5 text-[10px]' : 'mt-1 text-xs'} font-black text-violet-700`}>
      老師接手中
    </p>
  );
}

function DispatchConfirmDialog({pending, onCancel, onConfirm}: {pending: DispatchConfirmState; onCancel: () => void; onConfirm: (zone: SchoolZoneStatus) => void}) {
  const zone = pending?.zone;
  return (
    <AnimatePresence>
      {zone && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
        >
          <motion.div
            initial={{scale: 0.96, y: 12}}
            animate={{scale: 1, y: 0}}
            exit={{scale: 0.96, y: 12}}
            className="w-full max-w-lg rounded-3xl border border-teal-100 bg-white p-5 text-left shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-widest text-teal-600 uppercase">確認派遣</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">真的要移動到 {zone.name}？</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
                  來源：{pending.reason}。確認後才會送出任務、啟動移動動畫，並同步到機器人顯示頁。
                </p>
              </div>
              <button onClick={onCancel} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200" aria-label="取消派遣">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {[
                ['1', '建立任務', `${zone.location} · ${getZoneStatusLabel(zone)}`],
                ['2', '機器人前往現場', '地圖會鎖定，避免誤觸其他區域。'],
                ['3', '到場後回報結果', '機器人前端會要求選擇「已解決」或「通報老師」。'],
              ].map(([index, title, detail]) => (
                <div key={index} className="grid grid-cols-[2rem_1fr] gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-sm font-black text-teal-700 ring-1 ring-teal-100">{index}</span>
                  <span>
                    <span className="block text-sm font-black text-slate-950">{title}</span>
                    <span className="mt-0.5 block text-xs font-bold leading-5 text-slate-500">{detail}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1.2fr]">
              <button onClick={onCancel} className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition hover:bg-slate-50">
                先不要移動
              </button>
              <button onClick={() => onConfirm(zone)} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-teal-600 px-4 text-sm font-black text-white shadow-lg shadow-teal-200 transition hover:bg-teal-700">
                <Bot className="h-5 w-5" />
                確認派遣
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ChatScrollContainer({messages, children}: {messages: unknown[]; children: ReactNode}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages.length]);
  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-3">
      {children}
      <div ref={endRef} />
    </div>
  );
}

function Surface({children, className = ''}: {children: ReactNode; className?: string}) {
  return <div className={`min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-sm ${className}`}>{children}</div>;
}

function GlassPanel({children, className = ''}: {children: ReactNode; className?: string}) {
  return <Surface className={`app3-work-card min-w-0 p-4 ${className}`}>{children}</Surface>;
}

const SIGNAL_TILE_STYLES: Record<string, {bg: string; val: string; lbl: string}> = {
  teal:    {bg: 'bg-teal-50/80 border-teal-200/80',       val: 'text-teal-700',    lbl: 'text-teal-500'},
  rose:    {bg: 'bg-rose-50/80 border-rose-200/80',       val: 'text-rose-700',    lbl: 'text-rose-500'},
  amber:   {bg: 'bg-amber-50/80 border-amber-200/80',     val: 'text-amber-700',   lbl: 'text-amber-600'},
  emerald: {bg: 'bg-emerald-50/80 border-emerald-200/80', val: 'text-emerald-700', lbl: 'text-emerald-600'},
  slate:   {bg: 'bg-slate-50/80 border-slate-200/80',     val: 'text-slate-700',   lbl: 'text-slate-500'},
  violet:  {bg: 'bg-violet-50/80 border-violet-200/80',   val: 'text-violet-700',  lbl: 'text-violet-600'},
};

function SignalTile({label, value, tone}: {label: string; value: string; tone: SignalTone}) {
  const s = SIGNAL_TILE_STYLES[tone];
  return (
    <div className={`min-w-20 rounded-xl border p-3 ${s.bg}`}>
      <p className={`text-[10px] font-black ${s.lbl}`}>{label}</p>
      <p className={`mt-1 text-2xl font-black ${s.val}`}>{value}</p>
    </div>
  );
}

function ShowcaseHighlight({label, value, tone, icon: Icon}: {label: string; value: string; tone: SignalTone; icon: LucideIcon}) {
  const s = SIGNAL_TILE_STYLES[tone];
  return (
    <div className={`min-w-0 rounded-xl border px-3 py-2 ${s.bg}`}>
      <div className="flex min-w-0 items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/80 ${s.val}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-[10px] font-black ${s.lbl}`}>{label}</span>
          <span className="mt-0.5 block truncate text-xs font-black text-slate-800">{value}</span>
        </span>
      </div>
    </div>
  );
}

function MetricTile({label, value}: {label: string; value: string | number}) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-3 text-center">
      <p className="text-[10px] font-black text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function MiniMetric({label, value}: {label: string; value: string | number}) {
  return <MetricTile label={label} value={value} />;
}

function StatusLine({label, value, icon: Icon, tone = 'teal'}: {key?: unknown; label: string; value: string; icon?: LucideIcon; tone?: 'teal' | 'rose' | 'amber' | 'emerald'}) {
  const dot = tone === 'rose' ? 'bg-rose-500' : tone === 'amber' ? 'bg-amber-500' : tone === 'emerald' ? 'bg-emerald-500' : 'bg-teal-500';
  const valColor = tone === 'rose' ? 'text-rose-700' : tone === 'amber' ? 'text-amber-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-teal-700';
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3">
      <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-600">
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-teal-600" /> : <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />}
        <span className="truncate">{label}</span>
      </span>
      <span className={`shrink-0 text-sm font-black ${valColor}`}>{value}</span>
    </div>
  );
}

function StatusChip({level}: {level: 'high' | 'medium' | 'low'}) {
  const label = level === 'high' ? '高風險 ⚠' : level === 'medium' ? '注意' : '安全';
  const tone = level === 'high'
    ? 'border-rose-200/80 bg-rose-50 text-rose-700 shadow-sm shadow-rose-100'
    : level === 'medium'
      ? 'border-amber-200/80 bg-amber-50 text-amber-700 shadow-sm shadow-amber-100'
      : 'border-emerald-200/80 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100';
  return <span className={`rounded-full border px-3 py-1 text-xs font-black ${tone}`}>{label}</span>;
}

function IdleChip() {
  return <span className="rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs font-black text-slate-600 shadow-sm">待機</span>;
}

function TeacherHandoffChip() {
  return <span className="rounded-full border border-violet-200/80 bg-violet-50 px-3 py-1 text-xs font-black text-violet-700 shadow-sm shadow-violet-100">老師接手</span>;
}

function RiskBadge({level}: {level: 'high' | 'medium' | 'low'}) {
  return <StatusChip level={level} />;
}

function PrimaryAction({children, onClick, disabled, active, className = ''}: {children: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean; className?: string}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 ${
        active
          ? 'bg-emerald-600 shadow-md shadow-emerald-200 ring-4 ring-emerald-100 hover:bg-emerald-700'
          : 'bg-teal-600 shadow-md shadow-teal-200/60 hover:bg-teal-700'
      } ${className}`}
    >
      {children}
    </button>
  );
}

function LegendDot({tone, label}: {tone: 'emerald' | 'amber' | 'rose' | 'violet'; label: string}) {
  const s = tone === 'emerald'
    ? {dot: 'bg-emerald-500', pill: 'border-emerald-200/70 bg-emerald-50/80 text-emerald-700'}
    : tone === 'amber'
      ? {dot: 'bg-amber-500', pill: 'border-amber-200/70 bg-amber-50/80 text-amber-700'}
      : tone === 'rose'
        ? {dot: 'bg-rose-500', pill: 'border-rose-200/70 bg-rose-50/80 text-rose-700'}
        : {dot: 'bg-violet-500', pill: 'border-violet-200/70 bg-violet-50/80 text-violet-700'};
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-black ${s.pill}`}>
      <span className={`h-2 w-2 rounded-full shadow-sm ${s.dot}`} />
      {label}
    </span>
  );
}

function InsightStrip({
  proactiveInsight,
  dispatchableCount,
  onCreateProactiveAlert,
  onOpenPanel,
}: {
  proactiveInsight: ProactiveInsight;
  dispatchableCount: number;
  onCreateProactiveAlert: () => void;
  onOpenPanel: (panel: ActivePanel) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-teal-200/50 bg-linear-to-r from-teal-50/60 to-white shadow-sm">
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100/80 text-teal-700 shadow-sm shadow-teal-100">
            <Radar className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black text-teal-600">AI 巡查</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">{proactiveInsight.riskLevel === 'high' ? '優先關懷' : proactiveInsight.riskLevel === 'medium' ? '需要觀察' : '穩定'}</h3>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 md:w-72">
          <button onClick={onCreateProactiveAlert} className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800">
            建立提醒
          </button>
          <button onClick={() => onOpenPanel('alerts')} className="min-h-11 rounded-xl border border-teal-200/70 bg-white px-4 text-sm font-black text-teal-700 shadow-sm transition hover:bg-teal-50">
            {dispatchableCount} 區可派
          </button>
        </div>
      </div>
    </div>
  );
}

function panelTitle(panel: Exclude<ActivePanel, null>) {
  if (panel === 'alerts') return '預警處理';
  if (panel === 'sensing') return '環境感知';
  if (panel === 'care') return '學生照護';
  return '機器人狀態';
}

function panelSubtitle(panel: Exclude<ActivePanel, null>) {
  if (panel === 'alerts') return '從大地圖選區接續到事件補證與老師處理';
  if (panel === 'sensing') return '把現場聲音、影像與融合訊號轉成證據';
  if (panel === 'care') return '用低壓關懷完成學生照護紀錄';
  return '硬體連線與派遣狀態';
}
