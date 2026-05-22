import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { BottomSheet } from '../components/ui';
import { MessageCircle, AlertCircle, Send, Activity, Focus, ArrowUpRight, Mic, ImagePlus, Camera, Video, CheckCircle2, UserRound } from 'lucide-react';
import { useAppActions, useAppState } from '../state/AppStateProvider';
import type { TeachingSignal } from '../state/appState';
import { generateTeacherReply } from '../services/localAi';
import { openPrintableReport } from '../services/reports';
import {useCamera} from '../hooks/useCamera';
import {useGemmaVision} from '../hooks/useGeminiVision';
import {
  analyzeClassroomAlerts,
  analyzeClassroomPixels,
  analyzeClassroomFrame,
  captureClassroomImage,
  captureClassroomFrame,
  detectClassroomPeople,
  localClassroomAnalysis,
  reconcileTrackedPeople,
  type ClassroomAnalysisResult,
  type ClassroomPersonDetection,
  type ClassroomTrackedPerson,
} from '../services/classroomVision';

const SCENE_LABELS: Record<string, string> = {
  crowd: '人流偵測',
  safety: '安全警示',
  cleaning: '清潔需求',
  delivery: '配送任務',
  patrol: '一般巡邏',
};

const SUBJECTS = ['數學', '語文', '自然', '社會', '英語', '體育', '藝術'] as const;

const CHAT_SUGGESTIONS = ['好問題！我先簡單說明。', '請大家看黑板這邊的說明。', '好問題，稍後全班統一說明！'] as const;
const STUDENT_QUICK_RESPONSES = ['我需要再講一次', '我懂了，謝謝', '我想問一個問題', '我有點跟不上'] as const;
const STUDENT_SIGNAL_OPTIONS = [
  {id: 'question', type: 'question', label: '我想提問', message: '我想問一個問題，請老師協助說明。'},
  {id: 'confused', type: 'alert', label: '我有點跟不上', message: '學生回報目前有點跟不上，需要老師放慢或補充說明。'},
  {id: 'repeat', type: 'question', label: '需要再講一次', message: '我需要老師再講一次剛剛的重點。'},
  {id: 'understood', type: 'question', label: '我懂了', message: '學生回報已理解，可以進入下一段課程。'},
] as const;
const BUILT_IN_TEST_VIDEO = './life-videos/corridor.mp4';

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: {results: ArrayLike<ArrayLike<{transcript: string}>>}) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type AttendanceScanResult = {
  count: number;
  source: 'yolo' | 'local' | 'llm-cv';
  updatedAt: number;
  note: string;
};

type StableAttendanceResult = {
  count: number;
  source: AttendanceScanResult['source'];
  note: string;
  stabilized: boolean;
};

function getClassroomAtmosphere(analysis: ClassroomAnalysisResult | null) {
  if (!analysis) {
    return {
      label: '等待環場分析',
      tone: 'bg-white/40',
      glow: 'shadow-[0_0_10px_rgba(255,255,255,0.35)]',
      detail: '尚未取得氛圍資料',
    };
  }

  if (analysis.motion === 'restless' || analysis.focusScore < 62 || analysis.emotion === 'distracted') {
    return {
      label: '浮動需確認',
      tone: 'bg-tertiary',
      glow: 'shadow-[0_0_10px_rgba(var(--color-tertiary),0.8)]',
      detail: `專注 ${analysis.focusScore}% · ${analysis.emotionLabel}`,
    };
  }

  if (analysis.emotion === 'tired' || analysis.focusScore < 74) {
    return {
      label: '偏低需帶動',
      tone: 'bg-amber-300',
      glow: 'shadow-[0_0_10px_rgba(252,211,77,0.75)]',
      detail: `專注 ${analysis.focusScore}% · ${analysis.emotionLabel}`,
    };
  }

  if (analysis.focusScore >= 84 && analysis.emotion === 'engaged') {
    return {
      label: '投入穩定',
      tone: 'bg-[#87d46c]',
      glow: 'shadow-[0_0_10px_#87d46c]',
      detail: `專注 ${analysis.focusScore}% · ${analysis.emotionLabel}`,
    };
  }

  return {
    label: '穩定學習',
    tone: 'bg-primary',
    glow: 'shadow-[0_0_10px_rgba(var(--color-primary),0.75)]',
    detail: `專注 ${analysis.focusScore}% · ${analysis.emotionLabel}`,
  };
}

function getLearningAlerts(analysis: ClassroomAnalysisResult | null) {
  if (!analysis) {
    return [
      {label: '等待掃描', detail: '尚未取得教室影像，請用即時鏡頭、影片辨識或上傳氛圍照片開始分析。'},
      {label: '資料來源', detail: '點名人數由 YOLO 負責；專注度、學習警示與氛圍描述由 AI / 本地分析負責。'},
    ];
  }

  if (Array.isArray(analysis.learningAlerts) && analysis.learningAlerts.length) {
    return analysis.learningAlerts.slice(0, 3);
  }

  const alerts: Array<{label: string; detail: string}> = [];
  if (analysis.focusScore < 65) {
    alerts.push({label: '專注偏低', detail: `整體專注度 ${analysis.focusScore}%，建議先停下來用短問答確認理解。`});
  } else if (analysis.focusScore < 78) {
    alerts.push({label: '需要帶動', detail: `整體專注度 ${analysis.focusScore}%，可安排同桌討論或舉手回饋。`});
  }

  if (analysis.motion === 'restless') {
    alerts.push({label: '動作量偏高', detail: '畫面動作量偏高，可能有走動、聊天或轉移注意力。'});
  }

  if (analysis.emotion === 'tired' || analysis.emotion === 'distracted') {
    alerts.push({label: analysis.emotionLabel, detail: `班級狀態偏向「${analysis.emotionLabel}」，可切換成操作、圖像或短活動。`});
  }

  return alerts.length ? alerts.slice(0, 3) : [
    {label: '狀態穩定', detail: `目前專注度 ${analysis.focusScore}%，維持原教學節奏。`},
  ];
}

function LoadingScrim({label = 'AI 分析中'}: {label?: string}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-surface-container-lowest/70 backdrop-blur-[2px]">
      <div className="flex items-center gap-2 rounded-full border border-primary/15 bg-white/85 px-3 py-2 text-[11px] font-black text-primary shadow-sm">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <span>{label}</span>
      </div>
    </div>
  );
}

type VisionAlert = {
  label: string;
  message: string;
  category?: string;
  severity?: 'notice' | 'warning' | 'critical';
  boxes?: Array<{x: number; y: number; width: number; height: number}>;
};

type DisplayTeachingSignal = TeachingSignal & {
  repeatedCount: number;
  category: string;
  priority: number;
};

function compactText(input: string) {
  return input.toLowerCase().replace(/[\s，。！？、,.!?：:；;「」『』（）()[\]-]/g, '');
}

function alertCategory(label: string, message: string) {
  const text = compactText(`${label} ${message}`);
  if (text.includes('手機') || text.includes('電子裝置') || text.includes('phone') || text.includes('mobile')) return 'device';
  if (text.includes('睡') || text.includes('趴') || text.includes('低頭') || text.includes('tired') || text.includes('sleep')) return 'tired';
  if (text.includes('舉手') || text.includes('求助') || text.includes('raise') || text.includes('hand')) return 'help';
  if (text.includes('分心') || text.includes('躁動') || text.includes('專注') || text.includes('restless')) return 'focus';
  return compactText(message).slice(0, 32) || compactText(label);
}

function alertSeverity(category: string): VisionAlert['severity'] {
  if (category === 'device' || category === 'tired') return 'critical';
  if (category === 'focus') return 'warning';
  return 'notice';
}

function normalizeVisionAlerts(alerts: VisionAlert[]) {
  const rank = {critical: 3, warning: 2, notice: 1};
  const merged = new Map<string, VisionAlert>();
  alerts.forEach((alert) => {
    const category = alert.category ?? alertCategory(alert.label, alert.message);
    const severity = alert.severity ?? alertSeverity(category);
    const current = merged.get(category);
    if (!current || rank[severity] > rank[current.severity ?? 'notice']) {
      merged.set(category, {...alert, category, severity});
    }
  });
  return [...merged.values()]
    .sort((a, b) => rank[b.severity ?? 'notice'] - rank[a.severity ?? 'notice'])
    .slice(0, 2);
}

function signalCategory(signal: TeachingSignal) {
  if (signal.type === 'question') return `question:${signal.studentId}:${compactText(signal.message).slice(0, 24)}`;
  return `alert:${alertCategory(signal.name, signal.message)}`;
}

function signalPriority(signal: TeachingSignal) {
  if (signal.type === 'question') return 4;
  const category = signalCategory(signal);
  if (category.includes('device') || category.includes('tired')) return 5;
  if (category.includes('focus')) return 3;
  return 2;
}

function collapseTeachingSignals(signals: TeachingSignal[]): DisplayTeachingSignal[] {
  const groups = new Map<string, DisplayTeachingSignal>();
  signals.forEach((signal) => {
    const category = signalCategory(signal);
    const existing = groups.get(category);
    const next: DisplayTeachingSignal = {
      ...signal,
      category,
      priority: signalPriority(signal),
      repeatedCount: (existing?.repeatedCount ?? 0) + 1,
    };
    if (!existing || Date.parse(signal.createdAt) >= Date.parse(existing.createdAt)) {
      groups.set(category, next);
    } else {
      existing.repeatedCount += 1;
    }
  });
  return [...groups.values()]
    .sort((a, b) => b.priority - a.priority || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);
}

function getVisionAlerts(analysis: ClassroomAnalysisResult): VisionAlert[] {
  if (Array.isArray(analysis.visualAlerts) && analysis.visualAlerts.length) {
    return normalizeVisionAlerts(analysis.visualAlerts.map((item) => ({
      label: item.label,
      message: item.message,
      category: alertCategory(item.label, item.message),
      boxes: item.boxes,
    })));
  }

  const learningAlertText = (analysis.learningAlerts ?? []).map((item) => `${item.label} ${item.detail}`).join(' ');
  const text = `${analysis.summary} ${(analysis.evidence ?? []).join(' ')} ${learningAlertText}`.toLowerCase();
  const alerts: VisionAlert[] = [];
  if (/手機|滑手機|phone|mobile/.test(text)) {
    alerts.push({label: '電子裝置', message: '畫面疑似有學生使用手機或電子裝置，請老師確認。', category: 'device', severity: 'critical'});
  }
  if (/睡|睡覺|趴|趴睡|低頭很久|tired|sleep/.test(text)) {
    alerts.push({label: '精神低落', message: '畫面疑似有學生睡覺或長時間低頭，請老師確認。', category: 'tired', severity: 'critical'});
  }
  if (/舉手|raise|hand/.test(text)) {
    alerts.push({label: '求助訊號', message: '畫面偵測到疑似舉手或求助訊號，請老師留意。', category: 'help', severity: 'notice'});
  }
  if (analysis.emotion === 'distracted' || analysis.motion === 'restless') {
    alerts.push({label: '專注波動', message: '班級畫面出現分心或躁動趨勢，建議暫停確認學習狀態。', category: 'focus', severity: 'warning'});
  }
  return normalizeVisionAlerts(alerts);
}

export function TeachView({ showToast, navigateTo }: { showToast: (m: string) => void, navigateTo: (id: string, props?: any) => void }) {
  const state = useAppState();
  const actions = useAppActions();
  const [modal, setModal] = useState<string | null>(null);
  const [activeStudent, setActiveStudent] = useState<TeachingSignal | null>(null);
  const [chatReply, setChatReply] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentSubject, setCurrentSubject] = useState<string>('');
  const [focusScore, setFocusScore] = useState(0);
  const [waveData, setWaveData] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
  const [classroomAnalysis, setClassroomAnalysis] = useState<ClassroomAnalysisResult | null>(null);
  const [classroomPreviewImage, setClassroomPreviewImage] = useState<string | null>(null);
  const [attendanceScan, setAttendanceScan] = useState<AttendanceScanResult | null>(null);
  const [classroomAnalyzing, setClassroomAnalyzing] = useState(false);
  const [trackingActive, setTrackingActive] = useState(false);
  const [trackedPeople, setTrackedPeople] = useState<ClassroomTrackedPerson[]>([]);
  const [trackingSource, setTrackingSource] = useState<'yolo' | 'local'>('local');
  const [trackingFrame, setTrackingFrame] = useState<{width: number; height: number} | null>(null);
  const [attendancePhotoAnalyzing, setAttendancePhotoAnalyzing] = useState(false);
  const [atmospherePhotoAnalyzing, setAtmospherePhotoAnalyzing] = useState(false);
  const [testVideoUrl, setTestVideoUrl] = useState<string | null>(null);
  const [testVideoReady, setTestVideoReady] = useState(false);
  const [testVideoName, setTestVideoName] = useState('');
  const [studentResponse, setStudentResponse] = useState('');
  const [studentDeskName, setStudentDeskName] = useState('座號 18');
  const [studentDeskNote, setStudentDeskNote] = useState('');
  const [lastStudentSignal, setLastStudentSignal] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  const previousFrameRef = useRef<Uint8ClampedArray | null>(null);
  const trackingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const attendancePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const atmospherePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const testVideoInputRef = useRef<HTMLInputElement | null>(null);
  const trackedPeopleRef = useRef<ClassroomTrackedPerson[]>([]);
  const nextTrackIdRef = useRef(1);
  const attendanceStableRef = useRef<{count: number; updatedAt: number} | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const visionAlertKeysRef = useRef(new Set<string>());
  const activeTeachingScanTaskRef = useRef<string | null>(null);

  const {videoRef, canvasRef, ready: camReady, error: camError} = useCamera(modal === 'video' && !testVideoUrl);
  const videoFeedReady = camReady || testVideoReady;
  const {result: camResult, analyzing: camAnalyzing, source: camSource} = useGemmaVision(
    modal === 'video' && videoFeedReady,
    videoRef,
    canvasRef,
    5000,
  );
  const camScene = camResult?.scene ?? 'patrol';
  const camConfidence = camResult?.confidence ?? 0;
  const camZone = camResult?.zone ?? '';
  const detectedStudentCount = attendanceScan?.count ?? 0;
  const expectedAttendanceTotal = state.settings.expectedAttendanceTotal ?? 30;
  const missingAttendanceCount = attendanceScan ? Math.max(0, expectedAttendanceTotal - attendanceScan.count) : 0;
  const hasClassroomAnalysis = Boolean(classroomAnalysis);
  const classroomSourceLabel = classroomAnalysis?.source === 'gemini' ? '雲端 AI' : classroomAnalysis?.source === 'ollama' ? '本地 AI' : classroomAnalysis?.source === 'local' ? '本地 CV' : '分析中';
  const atmosphere = getClassroomAtmosphere(classroomAnalysis);
  const learningAlerts = getLearningAlerts(classroomAnalysis);
  const hasClassroomScan = hasClassroomAnalysis;
  const classroomOutputReady = hasClassroomAnalysis && !classroomAnalyzing;
  const classroomOutputPending = !classroomOutputReady;
  const visibleTeachingSignals = useMemo(
    () => collapseTeachingSignals(state.teachingSignals),
    [state.teachingSignals],
  );
  const professorLeadSignal = visibleTeachingSignals[0] ?? null;
  const studentQuestionCount = visibleTeachingSignals.filter((signal) => signal.type === 'question').length;
  const professorNextAction = professorLeadSignal
    ? (professorLeadSignal.type === 'alert' ? '先處理學習警示' : '回覆學生提問')
    : '等待學生或影像訊號';

  useEffect(() => {
    trackedPeopleRef.current = trackedPeople;
  }, [trackedPeople]);

  useEffect(() => {
    visionAlertKeysRef.current.clear();
    actions.clearTeachingSignals();
  }, [actions]);

  useEffect(() => {
    return () => {
      if (testVideoUrl?.startsWith('blob:')) URL.revokeObjectURL(testVideoUrl);
    };
  }, [testVideoUrl]);

  useEffect(() => {
    if (!classroomAnalysis) {
      setFocusScore(0);
      setWaveData([0, 0, 0, 0, 0, 0, 0, 0]);
      return;
    }
    setFocusScore(classroomAnalysis.focusScore);
    setWaveData(prev => {
      const next = [...prev.slice(1), classroomAnalysis.focusScore];
      return next.map((value) => Math.min(100, Math.max(0, Math.round(value))));
    });
  }, [classroomAnalysis]);

  const drawTrackingOverlay = (tracks: ClassroomTrackedPerson[], frameWidth: number, frameHeight: number) => {
    const canvas = trackingCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const rect = video.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const frameAspect = frameWidth / Math.max(1, frameHeight);
    const viewAspect = rect.width / Math.max(1, rect.height);
    const renderWidth = viewAspect > frameAspect ? rect.width : rect.height * frameAspect;
    const renderHeight = viewAspect > frameAspect ? rect.width / frameAspect : rect.height;
    const offsetX = (rect.width - renderWidth) / 2;
    const offsetY = (rect.height - renderHeight) / 2;

    tracks.forEach((track) => {
      if (track.missed > 1) return;
      const [x1, y1, x2, y2] = track.box;
      const left = offsetX + (x1 / frameWidth) * renderWidth;
      const top = offsetY + (y1 / frameHeight) * renderHeight;
      const width = ((x2 - x1) / frameWidth) * renderWidth;
      const height = ((y2 - y1) / frameHeight) * renderHeight;
      const alpha = track.missed ? 0.45 : 0.95;

      ctx.strokeStyle = `rgba(89, 217, 154, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(89, 217, 154, 0.8)';
      ctx.shadowBlur = 8;
      ctx.strokeRect(left, top, width, height);
      ctx.shadowBlur = 0;

      const label = `#${track.id} ${(track.confidence * 100).toFixed(0)}%`;
      ctx.font = '700 12px ui-monospace, SFMono-Regular, Menlo, monospace';
      const labelWidth = ctx.measureText(label).width + 12;
      ctx.fillStyle = `rgba(12, 24, 20, ${alpha})`;
      ctx.fillRect(left, Math.max(0, top - 22), labelWidth, 20);
      ctx.fillStyle = `rgba(225, 255, 239, ${alpha})`;
      ctx.fillText(label, left + 6, Math.max(14, top - 8));
    });
  };

	  const publishVisionAlerts = (analysis: ClassroomAnalysisResult) => {
    getVisionAlerts(analysis).forEach((alert, index) => {
      const key = alert.category ?? alertCategory(alert.label, alert.message);
      if (visionAlertKeysRef.current.has(key)) return;
      visionAlertKeysRef.current.add(key);
      actions.addTeachingSignal({
        id: `vision-${key}-${Date.now()}-${index}`,
        type: 'alert',
        name: alert.label,
        studentId: `vision-${key}`,
        message: alert.message,
      });
	    });
	  };

	  const analyzeAndPublishAlerts = async (
	    capture: {imageDataUrl: string; imageBase64: string; width: number; height: number; data: Uint8ClampedArray},
	    signal?: AbortSignal,
	  ) => {
	    try {
	      const result = await analyzeClassroomAlerts(capture, signal);
	      if (signal?.aborted || !result.visualAlerts?.length) return;
	      publishVisionAlerts({
	        studentCount: attendanceScan?.count ?? 0,
	        focusScore: classroomAnalysis?.focusScore ?? 0,
	        emotion: classroomAnalysis?.emotion ?? 'neutral',
	        emotionLabel: classroomAnalysis?.emotionLabel ?? '穩定',
	        motion: classroomAnalysis?.motion ?? 'calm',
	        summary: classroomAnalysis?.summary ?? '',
	        evidence: classroomAnalysis?.evidence ?? [],
	        visualAlerts: result.visualAlerts,
	        source: result.source,
	        cv: classroomAnalysis?.cv ?? analyzeClassroomPixels(capture.width, capture.height, capture.data, previousFrameRef.current),
	      });
	    } catch {
	      // Visual alerts are best-effort and should never block attendance or atmosphere updates.
	    }
	  };

  const stabilizeAttendanceCount = (
    rawCount: number,
    source: AttendanceScanResult['source'],
    cvCount: number,
    mode: 'photo' | 'video',
  ): StableAttendanceResult => {
    const now = Date.now();
    const expected = Math.max(1, expectedAttendanceTotal);
    const previous = attendanceStableRef.current;
    const hasFreshStable =
      Boolean(previous) &&
      now - (previous?.updatedAt ?? 0) < 10 * 60 * 1000 &&
      (previous?.count ?? 0) >= Math.max(8, Math.round(expected * 0.45));
    const safeRaw = Math.max(0, Math.round(rawCount || 0));
    const safeCv = Math.max(0, Math.round(cvCount || 0));
    const suspiciousSingleFrame =
      source === 'yolo' &&
      safeRaw > 0 &&
      safeRaw < Math.max(6, Math.round(expected * 0.35)) &&
      (hasFreshStable || safeCv >= Math.max(8, Math.round(expected * 0.35)));
    const suddenDrop =
      source === 'yolo' &&
      hasFreshStable &&
      safeRaw > 0 &&
      safeRaw < Math.round((previous?.count ?? 0) * 0.62);
    const cvSupportsMore =
      source === 'yolo' &&
      safeCv >= Math.max(8, Math.round(expected * 0.35)) &&
      safeRaw < Math.round(safeCv * 0.62);

    let count = safeRaw;
    let stabilized = false;
    let note = '';

    if (suspiciousSingleFrame || suddenDrop || cvSupportsMore) {
      count = Math.max(safeRaw, safeCv, hasFreshStable ? previous?.count ?? 0 : 0);
      if (count > expected && count <= expected + 2) count = expected;
      count = Math.min(count, Math.max(45, expected));
      stabilized = true;
      note = mode === 'video'
        ? 'YOLO 單幀框選偏低，已用前後影格與本機 CV 做穩定化。'
        : 'YOLO 單次框選偏低，已用本機 CV 與前次穩定值做融合。';
    }

    if (count > 0) attendanceStableRef.current = {count, updatedAt: now};
    return {count, source, note, stabilized};
  };

  const applyDetectionTracks = (
    detections: ClassroomPersonDetection[],
    source: 'yolo' | 'local',
    frame: {width: number; height: number},
    fallbackCount = 0,
  ) => {
    const hasYoloPeople = source === 'yolo' && detections.length > 0;
    const rawCount = hasYoloPeople ? detections.length : fallbackCount;
    const attendanceSource: AttendanceScanResult['source'] = hasYoloPeople ? 'yolo' : 'llm-cv';
    const stable = stabilizeAttendanceCount(rawCount, attendanceSource, fallbackCount, 'photo');
    const count = stable.count;
    const missing = Math.max(0, expectedAttendanceTotal - count);
    setAttendanceScan({
      count,
      source: attendanceSource,
      updatedAt: Date.now(),
      note: attendanceSource === 'yolo'
        ? `點名辨識：YOLO 框選 ${detections.length} 人，融合估算 ${count}/${expectedAttendanceTotal} 人${missing > 0 ? `，不足 ${missing} 人待確認` : '，人數已到齊'}。${stable.note || '接續分析學習氛圍。'}`
        : `點名辨識：YOLO 暫無可靠框選，先用本機 CV 暫估 ${count}/${expectedAttendanceTotal} 人。`,
    });
    setTrackingFrame(frame);
    setTrackingSource(source);

    if (detections.length) {
      const tracks = detections.map((item, index) => ({
        ...item,
        id: index + 1,
        age: 1,
        missed: 0,
      }));
      setTrackedPeople(tracks);
      trackedPeopleRef.current = tracks;
      nextTrackIdRef.current = tracks.length + 1;
    } else {
      setTrackedPeople([]);
      trackedPeopleRef.current = [];
      nextTrackIdRef.current = 1;
    }
	    return count;
	  };

	  const publishFastClassroomAnalysis = (
	    capture: {width: number; height: number; data: Uint8ClampedArray},
	    previous?: Uint8ClampedArray | null,
	  ) => {
	    const cv = analyzeClassroomPixels(capture.width, capture.height, capture.data, previous);
	    const quick = localClassroomAnalysis(cv);
	    setClassroomAnalysis({
	      ...quick,
	      summary: `${quick.summary} AI 複核完成後會自動覆蓋。`,
	      evidence: quick.evidence.slice(0, 5),
	    });
	  };

	  useEffect(() => {
    if (modal !== 'video' || !videoFeedReady || !trackingActive) {
      const ctx = trackingCanvasRef.current?.getContext('2d');
      if (ctx && trackingCanvasRef.current) ctx.clearRect(0, 0, trackingCanvasRef.current.width, trackingCanvasRef.current.height);
      return;
    }

    const ctrl = new AbortController();
    async function loop() {
      while (!ctrl.signal.aborted) {
	        const capture = captureClassroomFrame(videoRef.current, canvasRef.current, 640, 0.78);
	        if (capture) {
	          setClassroomPreviewImage(capture.imageDataUrl);
	          setClassroomAnalyzing(true);
	          publishFastClassroomAnalysis(capture, previousFrameRef.current);
	          void analyzeAndPublishAlerts(capture, ctrl.signal);
	          const result = await detectClassroomPeople(capture, ctrl.signal);
	          if (ctrl.signal.aborted) break;
          const cvCount = analyzeClassroomPixels(capture.width, capture.height, capture.data, previousFrameRef.current).estimatedPeople;
          const reconciled = reconcileTrackedPeople(trackedPeopleRef.current, result.detections, nextTrackIdRef.current);
          const visibleCount = reconciled.tracks.filter((track) => track.missed === 0).length;
          const hasYoloPeople = result.source === 'yolo' && visibleCount > 0;
          const attendanceSource: AttendanceScanResult['source'] = hasYoloPeople ? 'yolo' : 'llm-cv';
          const stableAttendance = stabilizeAttendanceCount(
            hasYoloPeople ? visibleCount : cvCount,
            attendanceSource,
            cvCount,
            'video',
          );
          const attendanceCount = stableAttendance.count;
          nextTrackIdRef.current = reconciled.nextId;
          trackedPeopleRef.current = reconciled.tracks;
          setTrackedPeople(reconciled.tracks);
          setTrackingSource(result.source);
          setTrackingFrame({width: capture.width, height: capture.height});
          drawTrackingOverlay(reconciled.tracks, capture.width, capture.height);
          const scanLabel = testVideoUrl ? '影片點名' : '即時點名';
          setAttendanceScan({
            count: attendanceCount,
            source: attendanceSource,
            updatedAt: Date.now(),
            note: attendanceSource === 'yolo'
              ? `${scanLabel}：YOLO 框選 ${visibleCount} 人，融合估算 ${attendanceCount}/${expectedAttendanceTotal} 人${Math.max(0, expectedAttendanceTotal - attendanceCount) > 0 ? `，不足 ${Math.max(0, expectedAttendanceTotal - attendanceCount)} 人待確認` : '，人數已到齊'}。${stableAttendance.note || '接續分析學習氛圍。'}`
              : `${scanLabel}：YOLO 暫無可靠框選，先用本機 CV 暫估 ${attendanceCount}/${expectedAttendanceTotal} 人。`,
          });

	          try {
            const yoloForAnalysis = result.source === 'yolo'
              ? {
                  yoloPersonCount: result.detections.length,
                  imageSize: {width: capture.width, height: capture.height},
                  detections: result.detections,
                }
              : undefined;
	            const analysis = await analyzeClassroomFrame(capture, previousFrameRef.current, ctrl.signal, yoloForAnalysis);
	            if (ctrl.signal.aborted) break;
            previousFrameRef.current = new Uint8ClampedArray(capture.data);
            setClassroomAnalysis({
              ...analysis,
              summary: analysis.summary,
              evidence: analysis.evidence.slice(0, 5),
            });
            publishVisionAlerts(analysis);
            completeTeachingScanTask(activeTeachingScanTaskRef.current, `分析結果已輸出：專注度 ${analysis.focusScore}%`);
	          } finally {
            if (!ctrl.signal.aborted) setClassroomAnalyzing(false);
          }
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 3000));
      }
    }
    void loop();
    return () => ctrl.abort();
  }, [modal, videoFeedReady, trackingActive, videoRef, canvasRef]);

  const openStudent = (signal: TeachingSignal) => {
    setChatReply(null);
    setChatInput('');
    setStudentResponse('');
    setIsTyping(false);
    setActiveStudent(signal);
    setModal('student');
  };

  const handleQuickStudentResponse = (response: string) => {
    setStudentResponse(response);
    showToast(`已收到學生回應：${response}`);
  };

  const sendStudentSignal = (option: (typeof STUDENT_SIGNAL_OPTIONS)[number]) => {
    const studentName = studentDeskName.trim() || '匿名學生';
    const note = studentDeskNote.trim();
    const message = note ? `${option.message} 補充：${note}` : option.message;
    const studentKey = compactText(studentName).slice(0, 24) || 'guest';

    actions.addTeachingSignal({
      type: option.type,
      name: studentName,
      studentId: `student-${studentKey}`,
      message,
    });
    setLastStudentSignal(`${studentName} / ${option.label}`);
    setStudentDeskNote('');
    showToast(`學生端已送出：${option.label}`);
  };

  const toggleStudentVoice = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognitionCtor = (window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    }).SpeechRecognition ?? (window as unknown as {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    }).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      showToast('這台瀏覽器不支援語音輸入，請改用快速回應');
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'zh-TW';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const first = event.results[0]?.[0]?.transcript ?? '';
      if (first.trim()) {
        setStudentResponse(first.trim());
        showToast('已收到學生語音回應');
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
      showToast('語音輸入失敗，請再試一次');
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const handleSendChat = async () => {
    if (!activeStudent || !chatInput.trim() || isTyping) return;
    const question = chatInput;
    setChatInput('');
    setIsTyping(true);
    try {
      const reply = await generateTeacherReply(question, currentSubject || undefined);
      setIsTyping(false);
      setChatReply(reply);
      actions.addTeacherReply({ signalId: activeStudent.id, reply });
      showToast('本地 AI 已產生並發送回覆');
    } catch (err) {
      setIsTyping(false);
      const fallbackReply = '雲端 AI 未即時回覆，已切換本機教學建議：先肯定學生提問，再用一個提示引導他重述重點，必要時請 R-01 顯示鼓勵表情。';
      setChatReply(fallbackReply);
      actions.addTeacherReply({ signalId: activeStudent.id, reply: fallbackReply });
      showToast('已切換本機教學建議');
    }
  };

  const handleAlertAction = (actionMsg: string) => {
    if (!activeStudent) return;
    actions.resolveTeachingSignal({ signalId: activeStudent.id, action: actionMsg });
    showToast(actionMsg);
    setModal(null);
  };

  const downloadReport = async () => {
    try {
      await openPrintableReport({ state, kind: 'class', title: '101 教室歷史課報告' });
      showToast('已開啟可列印報表');
      setModal(null);
    } catch {
      showToast('報表匯出失敗，請稍後再試');
    }
  };

  const resetVideoTracking = () => {
    setTrackedPeople([]);
    trackedPeopleRef.current = [];
    nextTrackIdRef.current = 1;
    previousFrameRef.current = null;
  };

  const resetLearningWarnings = () => {
    visionAlertKeysRef.current.clear();
    actions.clearTeachingSignals();
  };

  const startTeachingScanTask = (title: string, detail: string) => {
    const id = `teach-scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    activeTeachingScanTaskRef.current = id;
    actions.recordTeachingScanTask({id, title, detail});
    return id;
  };

  const completeTeachingScanTask = (id: string | null, detail = '分析結果已輸出') => {
    if (!id) return;
    actions.completeTeachingScanTask({id, detail});
    if (activeTeachingScanTaskRef.current === id) activeTeachingScanTaskRef.current = null;
  };

  const closeVideoModal = () => {
    setTrackingActive(false);
    setModal(null);
    setTestVideoUrl(null);
    setTestVideoReady(false);
    setTestVideoName('');
  };

  const handleRollCall = () => {
    resetLearningWarnings();
    setTestVideoUrl(null);
    setTestVideoReady(false);
    setTestVideoName('');
    setClassroomPreviewImage(null);
    if (!camReady) {
      setModal('video');
      setTrackingActive(true);
      showToast('請先允許攝影機，系統會用影像框選並每 3 秒讓 AI / 本地分析檢查氛圍');
      return;
    }
    setModal('video');
    setTrackingActive(true);
    resetVideoTracking();
    showToast('即時氛圍分析啟動：影像框選，每 3 秒由 AI / 本地分析複核');
  };

  const handleAttendanceCamera = () => {
    resetLearningWarnings();
    startTeachingScanTask('教學即時掃描', '即時鏡頭點名、人數辨識與學習氛圍分析');
    setTestVideoUrl(null);
    setTestVideoReady(false);
    setTestVideoName('');
    setModal('video');
    setTrackingActive(true);
    setAttendanceScan(null);
    setClassroomAnalysis(null);
    setClassroomPreviewImage(null);
    resetVideoTracking();
    showToast('點名辨識啟動：先辨識人數，再分析學習氛圍與即時告警');
  };

  const handleTestVideo = (file: File | undefined) => {
    if (!file) return;
    resetLearningWarnings();
    startTeachingScanTask('教學影片辨識', '使用影片抽幀完成點名、人數辨識與學習氛圍流程；正式點名仍以即時鏡頭或照片為準');
    const url = URL.createObjectURL(file);
    setTestVideoUrl(url);
    setTestVideoReady(false);
    setTestVideoName(file.name);
    setModal('video');
    setTrackingActive(true);
    setClassroomAnalysis(null);
    setClassroomPreviewImage(null);
    resetVideoTracking();
    showToast('影片辨識影像已載入：每 3 秒分析一個影格，立即輸出辨識結果');
    if (testVideoInputRef.current) testVideoInputRef.current.value = '';
  };

  const handleBuiltInTestVideo = () => {
    resetLearningWarnings();
    startTeachingScanTask('內建影片辨識', '使用內建影片完成抽幀、辨識與機器人連動流程；正式點名仍以即時鏡頭或照片為準');
    setTestVideoUrl(BUILT_IN_TEST_VIDEO);
    setTestVideoReady(false);
    setTestVideoName('內建課堂影片');
    setModal('video');
    setTrackingActive(true);
    setAttendanceScan(null);
    setClassroomAnalysis(null);
    setClassroomPreviewImage(null);
    resetVideoTracking();
    showToast('已載入內建影片辨識：不用攝影機也能展示辨識與機器人連動');
  };

  const handleAttendancePhoto = async (file: File | undefined) => {
    if (!file || attendancePhotoAnalyzing) return;
    resetLearningWarnings();
    const taskId = startTeachingScanTask('教學照片掃描', '點名照片人數辨識與學習氛圍分析');
    setModal(null);
    setAttendancePhotoAnalyzing(true);
    setClassroomAnalyzing(true);
    setTrackingActive(false);
    setAttendanceScan(null);

	    try {
	      const capture = await captureClassroomImage(file, 960, 0.82);
	      setClassroomPreviewImage(capture.imageDataUrl);
	      publishFastClassroomAnalysis(capture, previousFrameRef.current);
		      const alertPromise = analyzeAndPublishAlerts(capture);
		      const detection = await detectClassroomPeople(capture);
		      const cvCount = analyzeClassroomPixels(capture.width, capture.height, capture.data, previousFrameRef.current).estimatedPeople;
		      const count = applyDetectionTracks(detection.detections, detection.source, {width: capture.width, height: capture.height}, cvCount);
	      showToast(`點名照片辨識完成：${count} 人，學習氛圍分析持續更新中`);
	      const yoloForAnalysis = detection.source === 'yolo'
	        ? {
	            yoloPersonCount: detection.detections.length,
	            imageSize: {width: capture.width, height: capture.height},
	            detections: detection.detections,
	          }
	        : undefined;
	      const analysis = await analyzeClassroomFrame(capture, previousFrameRef.current, undefined, yoloForAnalysis);
	      previousFrameRef.current = new Uint8ClampedArray(capture.data);
      setClassroomAnalysis({
        ...analysis,
        summary: analysis.summary,
        evidence: analysis.evidence.slice(0, 5),
      });
	      publishVisionAlerts(analysis);
	      void alertPromise;
      completeTeachingScanTask(taskId, `分析結果已輸出：專注度 ${analysis.focusScore}%`);

	      showToast(`學習氛圍分析完成：專注度 ${analysis.focusScore}%`);
    } catch {
      showToast('照片讀取失敗，請換一張教室照片再試');
    } finally {
      setClassroomAnalyzing(false);
      setAttendancePhotoAnalyzing(false);
      if (attendancePhotoInputRef.current) attendancePhotoInputRef.current.value = '';
    }
  };

  const handleAtmospherePhoto = async (file: File | undefined) => {
    if (!file || atmospherePhotoAnalyzing) return;
    setModal(null);
    setAtmospherePhotoAnalyzing(true);
    setClassroomAnalyzing(true);
    setTrackingActive(false);
    setClassroomAnalysis(null);
    setClassroomPreviewImage(null);

	    try {
	      const capture = await captureClassroomImage(file, 960, 0.82);
	      setClassroomPreviewImage(capture.imageDataUrl);
	      publishFastClassroomAnalysis(capture, previousFrameRef.current);
	      const alertPromise = analyzeAndPublishAlerts(capture);
	      const analysis = await analyzeClassroomFrame(capture, previousFrameRef.current);
      previousFrameRef.current = new Uint8ClampedArray(capture.data);
      setClassroomAnalysis({
        ...analysis,
        summary: analysis.summary,
        evidence: analysis.evidence.slice(0, 5),
      });
	      publishVisionAlerts(analysis);
	      void alertPromise;
      setTrackingFrame({width: capture.width, height: capture.height});
      showToast(`學習氛圍照片分析完成：專注度 ${analysis.focusScore}%`);
    } catch {
      showToast('照片讀取失敗，請換一張教室照片再試');
    } finally {
      setClassroomAnalyzing(false);
      setAtmospherePhotoAnalyzing(false);
      if (atmospherePhotoInputRef.current) atmospherePhotoInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-headline font-bold">101 教室 <span className="text-on-surface-variant text-base">/ 歷史課</span></h2>
        <div className="bg-primary/10 px-3 py-1.5 rounded-full flex items-center gap-2 border border-primary/20 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--color-primary),0.5)]"></span>
          <span className="text-[10px] font-bold text-primary tracking-widest uppercase">即時分析</span>
        </div>
      </div>

      <section data-tour="student-professor-loop" className="grid grid-cols-1 gap-3 md:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary">Student live desk</p>
              <h3 className="mt-1 font-headline text-base font-bold tracking-wide">學生端即時回饋</h3>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserRound size={19} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[0.7fr_1.3fr]">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black tracking-widest text-on-surface-variant">座號 / 姓名</span>
              <input
                value={studentDeskName}
                onChange={(event) => setStudentDeskName(event.target.value.slice(0, 18))}
                className="h-11 w-full rounded-xl border border-outline-variant/25 bg-surface-container px-3 text-sm font-bold text-on-surface outline-none transition focus:border-primary/45 focus:bg-white"
                placeholder="座號 18"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black tracking-widest text-on-surface-variant">補充內容</span>
              <textarea
                value={studentDeskNote}
                onChange={(event) => setStudentDeskNote(event.target.value.slice(0, 90))}
                className="min-h-11 w-full resize-none rounded-xl border border-outline-variant/25 bg-surface-container px-3 py-2 text-sm font-medium text-on-surface outline-none transition focus:border-primary/45 focus:bg-white"
                placeholder="例：剛剛的原因推導不太懂"
              />
            </label>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STUDENT_SIGNAL_OPTIONS.map((option) => {
              const Icon = option.type === 'alert' ? AlertCircle : option.id === 'understood' ? CheckCircle2 : MessageCircle;
              return (
                <button
                  key={option.id}
                  onClick={() => sendStudentSignal(option)}
                  className={`min-h-14 rounded-xl border px-2.5 py-2 text-left transition active:scale-95 ${
                    option.type === 'alert'
                      ? 'border-tertiary/25 bg-tertiary/10 text-tertiary hover:bg-tertiary/15'
                      : 'border-primary/20 bg-primary/10 text-primary hover:bg-primary/15'
                  }`}
                >
                  <Icon size={16} className="mb-1" />
                  <span className="block text-[11px] font-black leading-4 tracking-wide">{option.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-outline-variant/20 bg-surface-container px-3 py-2">
            <span className="text-[10px] font-bold text-on-surface-variant">字數 {studentDeskNote.length}/90</span>
            <span className="min-w-0 truncate text-right text-[10px] font-black text-primary">
              {lastStudentSignal ? `上次送出：${lastStudentSignal}` : '學生按下後會直接進入教授佇列'}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary">Professor console</p>
              <h3 className="mt-1 font-headline text-base font-bold tracking-wide">教授處置佇列</h3>
            </div>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-black tracking-widest text-primary">
              {visibleTeachingSignals.length} 則
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              {label: '提問', value: studentQuestionCount},
              {label: '警示', value: visibleTeachingSignals.length - studentQuestionCount},
              {label: '專注', value: classroomOutputReady ? `${focusScore}%` : '--'},
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-outline-variant/20 bg-surface-container px-2 py-2.5 text-center">
                <p className="text-[9px] font-black tracking-widest text-on-surface-variant">{item.label}</p>
                <p className="mt-1 text-lg font-black leading-none text-on-surface">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 min-h-24 rounded-xl border border-outline-variant/25 bg-surface-container px-3 py-3">
            <p className="text-[10px] font-black tracking-widest text-on-surface-variant">下一步</p>
            {professorLeadSignal ? (
              <div className="mt-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-black text-on-surface">{professorLeadSignal.name}</p>
                  <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black tracking-widest ${
                    professorLeadSignal.type === 'alert' ? 'bg-tertiary/10 text-tertiary' : 'bg-primary/10 text-primary'
                  }`}>
                    {professorNextAction}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-on-surface-variant">{professorLeadSignal.message}</p>
                {professorLeadSignal.repeatedCount > 1 && (
                  <p className="mt-1 text-[10px] font-black text-on-surface-variant/60">同類訊號 x{professorLeadSignal.repeatedCount}</p>
                )}
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 text-xs font-bold text-on-surface-variant">
                <CheckCircle2 size={16} className="text-primary" />
                課堂訊號正常，完成影像辨識或學生回饋後會即時更新。
              </div>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => professorLeadSignal && openStudent(professorLeadSignal)}
              disabled={!professorLeadSignal}
              className="h-12 rounded-xl bg-primary px-3 text-xs font-black tracking-widest text-white shadow-[0_4px_12px_rgba(var(--color-primary),0.25)] transition active:scale-95 disabled:bg-surface-container-high disabled:text-on-surface-variant"
            >
              開啟處置
            </button>
            <button
              onClick={downloadReport}
              className="h-12 rounded-xl border border-primary/20 bg-primary/10 px-3 text-xs font-black tracking-widest text-primary transition hover:bg-primary/15 active:scale-95"
            >
              匯出報告
            </button>
          </div>
        </div>
      </section>

      {/* Attendance + Focus — side by side on tablet */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Attendance & Roll Call */}
      <section data-tour="attendance-card" className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/30 shadow-md flex items-center justify-between gap-4 relative overflow-hidden group">
        <input
          ref={attendancePhotoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handleAttendancePhoto(event.currentTarget.files?.[0])}
        />
        <input
          ref={atmospherePhotoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handleAtmospherePhoto(event.currentTarget.files?.[0])}
        />
        <input
          ref={testVideoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => handleTestVideo(event.currentTarget.files?.[0])}
        />
         <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform duration-700"></div>
        <div className="flex-1 min-w-0 relative z-10">
           <p className="text-[10px] font-bold text-on-surface-variant tracking-[0.2em] mb-1.5">出缺席場域評估</p>
           {attendanceScan ? (
             <div className="flex flex-col items-start gap-1">
	               <div className="flex items-baseline gap-2">
	                 <p className="font-headline font-bold text-2xl tracking-tighter text-on-surface leading-none">{detectedStudentCount}</p>
	                 <span className="text-xs font-bold tracking-widest text-on-surface-variant">/ {expectedAttendanceTotal} 人應到</span>
	               </div>
	               <span className={`text-[10px] font-bold text-white px-2.5 py-1 rounded-full whitespace-nowrap mt-1 tracking-widest ${missingAttendanceCount > 0 ? 'bg-tertiary shadow-[0_0_10px_rgba(var(--color-tertiary),0.25)]' : 'bg-primary shadow-[0_0_10px_rgba(var(--color-primary),0.3)]'}`}>
	                 {missingAttendanceCount > 0 ? `缺 ${missingAttendanceCount} 人待確認` : '人數到齊'}
	               </span>
               <p className="mt-1 line-clamp-2 text-[10px] font-medium text-on-surface-variant">{attendanceScan.note}</p>
             </div>
           ) : (
             <div className="mt-1">
                <p className="font-headline font-bold text-base text-on-surface-variant">等待點名辨識</p>
                <div className="mt-1 text-[10px] text-primary/70 animate-pulse flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span> 攝影機、影片或照片皆可操作</div>
             </div>
           )}
        </div>
        <div className="relative z-10 grid shrink-0 grid-cols-2 gap-2">
          <button
            onClick={handleAttendanceCamera}
            disabled={attendancePhotoAnalyzing}
            className="bg-primary hover:bg-primary/95 text-white active:scale-95 transition-all w-16 h-16 rounded-2xl shadow-[0_0_20px_rgba(var(--color-primary),0.3)] border-2 border-primary/20 flex flex-col items-center justify-center gap-1 disabled:opacity-60"
          >
            <Camera size={20} />
            <span className="text-[10px] font-bold tracking-widest text-center">辨識</span>
          </button>
          <button
            onClick={() => attendancePhotoInputRef.current?.click()}
            disabled={attendancePhotoAnalyzing}
            className="bg-primary/10 hover:bg-primary/15 text-primary active:scale-95 transition-all w-16 h-16 rounded-2xl border border-primary/20 flex flex-col items-center justify-center gap-1 disabled:opacity-60"
          >
            <ImagePlus size={20} />
            <span className="text-[10px] font-bold tracking-widest text-center">{attendancePhotoAnalyzing ? '點名中' : '照片'}</span>
          </button>
          <button
            onClick={handleBuiltInTestVideo}
            disabled={classroomAnalyzing}
            className="col-span-2 bg-secondary-container hover:bg-secondary-container/80 text-primary active:scale-95 transition-all h-12 rounded-2xl border border-primary/15 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Video size={18} />
            <span className="text-[10px] font-bold tracking-widest text-center">影片辨識</span>
          </button>
        </div>
      </section>

      <div role="button" tabIndex={0} aria-label="開啟班級專注度分析報表" onKeyDown={(e) => e.key === 'Enter' && setModal('chart')} className={`bg-surface-container-lowest rounded-2xl p-5 relative overflow-hidden shadow-md border border-outline-variant/30 cursor-pointer hover:bg-surface-container transition-all group active:scale-[0.98] ${classroomOutputPending ? 'opacity-60 saturate-50' : ''}`} onClick={() => setModal('chart')}>
          {classroomOutputPending && <LoadingScrim label={classroomAnalyzing ? '分析中' : '等待輸出'} />}
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-on-surface-variant font-mono">班級專注度評分</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <motion.h2
                  key={focusScore}
                  initial={{ opacity: 0.5, y: -5 }} animate={{ opacity: 1, y: 0 }}
                  className="font-headline font-bold text-4xl text-primary tracking-tighter"
                >
                  {classroomOutputReady ? focusScore : '--'}
                </motion.h2>
                <span className="text-xl text-on-surface-variant font-headline font-bold">%</span>
              </div>
              <p className="mt-1 text-[10px] font-bold tracking-widest text-on-surface-variant">
                {classroomOutputPending ? '等待分析輸出專注度' : `${classroomSourceLabel} 氛圍分析`}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-secondary-container text-primary flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:rotate-12 transition-all shadow-inner">
              <Activity size={20} />
            </div>
          </div>
          <div className="h-14 flex items-end gap-1.5 px-1 relative z-10">
            {waveData.map((h, i) => (
              <motion.div
                key={i}
                animate={{ height: `${classroomOutputReady ? Math.max(8, h) : 8}%` }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.8 }}
                className={`flex-1 rounded-t-md mx-[1px] ${classroomOutputReady && i === waveData.length - 1 ? 'bg-primary shadow-[0_0_15px_rgba(var(--color-primary),0.6)]' : 'bg-primary/50'}`}
                style={{ opacity: classroomOutputReady ? 0.4 + (h/100)*0.6 : 0.18 }}
              />
            ))}
          </div>
          {/* Decorative Graph Grid */}
          <div className="absolute inset-0 top-auto h-28 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to top, var(--color-primary) 1.5px, transparent 1.5px)', backgroundSize: '100% 24px' }}></div>
        </div>
      </div>{/* end attendance+focus grid */}

      <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/30 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="font-headline font-bold text-base tracking-wide">學習警示與氛圍分析</h3>
            <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">
              {classroomOutputPending ? '正在等待 AI / 本地分析輸出專注度、學習警示與氛圍描述，完成後會自動更新。' : atmosphere.detail}
            </p>
          </div>
        </div>
        <div className="mb-3 overflow-hidden rounded-xl border border-outline-variant/25 bg-surface-container">
          {classroomPreviewImage ? (
            <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr]">
              <div className="relative aspect-video overflow-hidden bg-black">
                <img src={classroomPreviewImage} alt="辨識中的教室畫面" className="h-full w-full object-cover" />
                <div className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/35"></div>
                <div className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/35"></div>
                <div className="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-1 text-[10px] font-black tracking-widest text-white backdrop-blur">
                  辨識畫面
                </div>
              </div>
              <div className="flex flex-col justify-center gap-2 px-4 py-3">
                <p className="text-[9px] font-black uppercase tracking-[0.28em] text-on-surface-variant">畫面分段</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {['左側', '中間', '右側'].map((label) => (
                    <div key={label} className="rounded-lg border border-outline-variant/25 bg-white px-2 py-2 text-center text-[11px] font-black text-primary">
                      {label}
                    </div>
                  ))}
                </div>
                <p className="text-xs font-medium leading-relaxed text-on-surface-variant">
                  下方氛圍描述會依左側、中間、右側整理 AI / 本地判讀結果。
                </p>
              </div>
            </div>
          ) : (
            <div className="flex aspect-[16/6] items-center justify-center px-4 text-center text-sm font-medium text-on-surface-variant">
              完成照片或鏡頭辨識後，這裡會顯示本次分析使用的教室畫面。
            </div>
          )}
        </div>
        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[0.95fr_1.35fr]">
          <div className={`relative overflow-hidden rounded-xl border border-outline-variant/25 bg-surface-container px-4 py-3 ${classroomOutputPending ? 'opacity-60 saturate-50' : ''}`}>
            {classroomOutputPending && <LoadingScrim label={classroomAnalyzing || classroomAnalysis?.source === 'local' ? '分析中' : '等待輸出'} />}
            <div className={classroomOutputPending ? 'opacity-35' : ''}>
              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-on-surface-variant">氛圍即時估測</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${atmosphere.tone} ${atmosphere.glow}`}></span>
                <span className="text-sm font-black text-on-surface">{atmosphere.label}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] font-medium text-on-surface-variant">{atmosphere.detail}</p>
            </div>
          </div>
          <div className={`relative overflow-hidden rounded-xl border border-outline-variant/25 bg-surface-container px-4 py-3 ${classroomOutputPending ? 'opacity-60 saturate-50' : ''}`}>
            {classroomOutputPending && <LoadingScrim label={classroomAnalyzing || classroomAnalysis?.source === 'local' ? '分析中' : '等待輸出'} />}
            <div className={classroomOutputPending ? 'opacity-35' : ''}>
              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-on-surface-variant">氛圍描述</p>
              <p className="mt-2 text-sm font-bold leading-relaxed text-on-surface">
                {classroomOutputReady ? classroomAnalysis?.summary : 'AI / 本地分析正在整理課堂氛圍，完成後會顯示自然語意描述。'}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          {classroomOutputPending ? (
            [0, 1, 2].map((index) => (
              <div key={`learning-alert-loading-${index}`} className="relative min-h-24 overflow-hidden rounded-xl border border-outline-variant/25 bg-white px-3 py-3 opacity-60 saturate-50">
                <LoadingScrim label={classroomAnalyzing || classroomAnalysis?.source === 'local' ? '分析中' : '等待輸出'} />
                <div className="space-y-2 opacity-30">
                  <div className="h-3 w-20 rounded-full bg-primary/30" />
                  <div className="h-2.5 w-full rounded-full bg-on-surface-variant/20" />
                  <div className="h-2.5 w-4/5 rounded-full bg-on-surface-variant/20" />
                </div>
              </div>
            ))
          ) : learningAlerts.map((item) => (
            <div key={`${item.label}-${item.detail}`} className="rounded-xl border border-outline-variant/25 bg-white px-3 py-3">
              <p className="text-[10px] font-black tracking-widest text-primary">{item.label}</p>
              <p className="mt-1 text-[11px] font-medium leading-relaxed text-on-surface-variant">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AI Signals */}
      <section data-tour="alert-list" className="space-y-3">
        <div className="flex items-center justify-between">
            <h3 className="font-headline font-bold text-base tracking-wide flex items-center gap-2">即時告警與訊號 <span className="text-[10px] bg-error/10 text-error px-2 py-0.5 rounded-full font-bold ml-1">{visibleTeachingSignals.length}</span></h3>
            {state.teachingSignals.length > visibleTeachingSignals.length && (
              <span className="text-primary/60 text-xs font-medium">已合併 {state.teachingSignals.length - visibleTeachingSignals.length} 則重複</span>
            )}
        </div>
        {visibleTeachingSignals.length === 0 ? (
           <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 text-center text-on-surface-variant font-medium text-sm shadow-sm">
             目前無異常或提問訊號
           </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {visibleTeachingSignals.map((sig) => (
              <motion.div
                key={sig.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => openStudent(sig)}
                className={`bg-surface-container-lowest border ${sig.type === 'alert' ? 'border-l-4 border-l-tertiary border-y-outline-variant/20 border-r-outline-variant/20 shadow-[0_2px_10px_rgba(var(--color-tertiary),0.08)]' : 'border-outline-variant/20 shadow-sm'} rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-surface-container transition-colors`}
              >
                <div className={`w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0 shadow-inner ${sig.type === 'alert' ? 'bg-tertiary text-white' : 'bg-primary/10 text-primary'}`}>
                  {sig.type === 'alert' ? <AlertCircle size={20} /> : <MessageCircle size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5 gap-2">
                    <h4 className="font-bold text-sm tracking-wide truncate">{sig.name}</h4>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border uppercase tracking-widest ${sig.type === 'alert' ? 'text-tertiary bg-tertiary/10 border-tertiary/20' : 'text-primary bg-primary/10 border-primary/20'}`}>
                      {sig.type === 'alert' ? (sig.priority >= 5 ? '需確認' : '提醒') : '提問中'}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-on-surface-variant/90 leading-relaxed line-clamp-2">{sig.message}</p>
                  {sig.repeatedCount > 1 && (
                    <p className="mt-1 text-[10px] font-black text-on-surface-variant/55">同類訊號已合併 x{sig.repeatedCount}</p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Interact Modals */}
      <BottomSheet isOpen={modal === 'student'} onClose={() => setModal(null)} title={`${activeStudent?.name} 即時互動`}>
        {activeStudent?.type === 'question' && (
          <div className="p-4 flex flex-col h-[65vh] min-h-[450px]">
            <div className="flex-1 overflow-y-auto space-y-6 pt-3 custom-scrollbar pr-2 mb-2">
              <div className="bg-surface-container p-6 rounded-[1.75rem] rounded-tl-[4px] text-[16px] w-[90%] text-on-surface shadow-sm leading-relaxed border border-outline-variant/30">
                <span className="text-[11px] text-on-surface-variant font-bold block mb-2 tracking-widest font-mono">{new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(activeStudent.createdAt))}</span>
                <p className="font-medium">{activeStudent.message}</p>
              </div>
              <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-[1.5rem] p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-[10px] font-bold text-on-surface-variant tracking-[0.25em]">學生回應</p>
                    <p className="text-xs text-on-surface-variant mt-1">可用語音說明，也可快速點選狀態。</p>
                  </div>
                  <button
                    onClick={toggleStudentVoice}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all active:scale-95 ${
                      isListening ? 'bg-error text-white border-error animate-pulse' : 'bg-primary/10 text-primary border-primary/20'
                    }`}
                    aria-label="學生語音回應"
                  >
                    <Mic size={18} />
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                  {STUDENT_QUICK_RESPONSES.map((response) => (
                    <button
                      key={response}
                      onClick={() => handleQuickStudentResponse(response)}
                      className="shrink-0 px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/30 text-xs font-bold text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      {response}
                    </button>
                  ))}
                </div>
                {studentResponse && (
                  <div className="mt-3 rounded-xl bg-primary/10 border border-primary/20 px-4 py-3 text-sm font-medium text-primary">
                    {studentResponse}
                  </div>
                )}
              </div>
              {isTyping && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-primary/10 text-primary p-6 rounded-[1.75rem] rounded-tr-[4px] text-sm w-fit self-end ml-auto shadow-sm flex gap-2.5 items-center border border-primary/20">
                   <div className="w-3 h-3 rounded-full bg-primary animate-bounce delay-75"></div>
                   <div className="w-3 h-3 rounded-full bg-primary animate-bounce delay-150"></div>
                   <div className="w-3 h-3 rounded-full bg-primary animate-bounce delay-300"></div>
                </motion.div>
              )}
              {chatReply && (
                <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="bg-primary text-white p-6 rounded-[1.75rem] rounded-tr-[4px] text-[16px] w-[90%] self-end ml-auto shadow-[0_4px_15px_rgba(var(--color-primary),0.3)] leading-relaxed border border-primary">
                  <span className="text-[11px] text-white/70 font-bold block mb-2 tracking-[0.2em] uppercase font-mono">剛剛</span>
                  <span className="break-words font-medium">{chatReply}</span>
                </motion.div>
              )}
            </div>

            {/* Nav button to view report */}
            <div className="pt-3 pb-3">
               <button
                 onClick={() => { setModal(null); navigateTo('student-report', { name: activeStudent.name, studentId: activeStudent.studentId }); }}
                 className="mt-2 text-[15px] font-bold text-primary flex items-center justify-center gap-2 w-full bg-primary/10 py-5 rounded-[1.5rem] hover:bg-primary/20 transition-all active:scale-[0.98] border border-primary/20 shadow-sm"
               >
                 開啟此訊號的學習狀態報告 <ArrowUpRight size={18} />
               </button>
            </div>

            {/* AI Suggestions */}
            {!isTyping && !chatReply && (
              <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-5 pt-3 -mx-4 px-4 snap-x">
                {CHAT_SUGGESTIONS.map((sug, idx) => (
                  <button
                    key={idx}
                    onClick={() => setChatInput(sug)}
                    className="shrink-0 bg-surface-container-high hover:bg-primary/10 text-primary text-[14px] font-bold px-7 py-4 rounded-[1.5rem] transition-colors truncate max-w-[280px] active:scale-95 border border-outline-variant/20 hover:border-primary/30 shadow-sm snap-center flex items-center gap-2"
                  >
                    <MessageCircle size={16} /> {sug}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1 mb-2">
              {SUBJECTS.map(s => (
                <button
                  key={s}
                  onClick={() => setCurrentSubject(prev => prev === s ? '' : s)}
                  className={`px-3 py-2 min-h-11 text-xs rounded-full border transition-colors ${
                    currentSubject === s
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="flex gap-3 pt-4 border-t border-outline-variant/30 items-center">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value.slice(0, 500))}
                onKeyDown={(e) => e.key === 'Enter' && !isTyping && handleSendChat()}
                maxLength={500}
                className="flex-1 rounded-[1.75rem] bg-surface-container border border-outline-variant/50 px-6 py-5 text-[16px] focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium placeholder-on-surface-variant/60"
                placeholder="輸入 AI 輔助回覆..."
                disabled={isTyping}
                aria-label="輸入 AI 輔助回覆"
              />
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim() || isTyping}
                className={`w-16 h-16 rounded-[1.75rem] flex items-center justify-center shrink-0 transition-colors ${chatInput.trim() && !isTyping ? 'bg-primary text-white shadow-[0_4px_15px_rgba(var(--color-primary),0.3)] active:scale-90 hover:bg-primary/95 cursor-pointer' : 'bg-surface-container border border-outline-variant/30 text-on-surface-variant cursor-not-allowed opacity-50'}`}
                aria-label="送出 AI 回覆"
              >
                <Send size={24} className={chatInput.trim() && !isTyping ? "translate-x-[-1px] translate-y-[1px]" : ""} />
              </button>
            </div>
          </div>
        )}
        {activeStudent?.type === 'alert' && (
          <div className="p-5 space-y-8 pb-8">
            <div className="bg-error/10 p-6 rounded-[1.75rem] border border-error/20 flex gap-5 shadow-inner">
               <AlertCircle className="text-error shrink-0 mt-1" size={32} />
               <div>
                  <h4 className="font-bold text-error mb-2 font-headline tracking-wide text-lg">注意力提醒</h4>
                  <p className="text-[15px] font-medium text-error/90 leading-relaxed">{activeStudent.message}</p>
               </div>
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-[1.5rem] p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant tracking-[0.25em]">學生回應</p>
                  <p className="text-xs text-on-surface-variant mt-1">讓學生用低壓方式回報目前學習狀態。</p>
                </div>
                <button
                  onClick={toggleStudentVoice}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all active:scale-95 ${
                    isListening ? 'bg-error text-white border-error animate-pulse' : 'bg-primary/10 text-primary border-primary/20'
                  }`}
                  aria-label="學生語音回應"
                >
                  <Mic size={18} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {STUDENT_QUICK_RESPONSES.map((response) => (
                  <button
                    key={response}
                    onClick={() => handleQuickStudentResponse(response)}
                    className="px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/30 text-xs font-bold text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    {response}
                  </button>
                ))}
              </div>
              {studentResponse && (
                <div className="mt-3 rounded-xl bg-primary/10 border border-primary/20 px-4 py-3 text-sm font-medium text-primary">
                  {studentResponse}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={() => handleAlertAction('已發送硬體震動提醒')}
                className="py-5 px-6 bg-tertiary text-white rounded-[1.75rem] font-bold text-[16px] tracking-wide active:scale-95 shadow-[0_4px_15px_rgba(var(--color-tertiary),0.3)] border border-tertiary/20 flex flex-col items-center justify-center transition-all bg-linear-to-br from-tertiary to-tertiary/80"
              >
                <span>發送平板震動提醒 (柔性)</span>
                <span className="text-[12px] opacity-80 font-medium mt-1">僅提醒本人，不影響他人</span>
              </button>
              <button
                onClick={() => handleAlertAction('已送出老師確認提醒')}
                className="py-5 px-6 bg-surface-container border border-error/30 hover:bg-error/5 text-error rounded-[1.75rem] font-bold text-[16px] tracking-wide active:scale-[0.98] transition-all"
              >
                送出老師確認提醒
              </button>
              <button
                onClick={() => { setModal(null); navigateTo('student-report', { name: activeStudent.name, studentId: activeStudent.studentId }); }}
                className="py-5 px-6 bg-primary/10 border border-primary/20 text-primary rounded-[1.75rem] font-bold text-[16px] tracking-wide active:scale-95 flex items-center justify-center gap-2 mt-2 transition-all hover:bg-primary/20"
              >
                開啟此訊號的學習狀態報告 <ArrowUpRight size={20} />
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Fullscreen Video Modal */}
      <BottomSheet isOpen={modal === 'video'} onClose={closeVideoModal} fullScreen={true}>
        <div className="w-full h-full bg-black relative flex flex-col justify-center overflow-hidden">
          {/* Camera or simulated live video feed — always in DOM so ref stays stable */}
          <video
            ref={videoRef}
            src={testVideoUrl ?? undefined}
            autoPlay
            loop={Boolean(testVideoUrl)}
            controls={false}
            disablePictureInPicture={Boolean(testVideoUrl)}
            controlsList="nodownload noplaybackrate noremoteplayback"
            playsInline
            muted
            onLoadedMetadata={(event) => {
              if (!testVideoUrl) return;
              setTestVideoReady(true);
              void event.currentTarget.play();
            }}
            onCanPlay={(event) => {
              if (!testVideoUrl) return;
              setTestVideoReady(true);
              void event.currentTarget.play();
            }}
            onError={() => {
              if (!testVideoUrl) return;
              setTestVideoReady(false);
              showToast('影片無法讀取，請換成瀏覽器可播放的 mp4 / mov / webm');
            }}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${videoFeedReady ? 'opacity-100' : 'opacity-0'}`}
          />
          <canvas ref={canvasRef} className="hidden" />
          <canvas
            ref={trackingCanvasRef}
            className={`absolute inset-0 z-[15] pointer-events-none transition-opacity duration-300 ${trackingActive ? 'opacity-100' : 'opacity-0'}`}
          />

          {/* Placeholder shown while camera starts */}
          {!videoFeedReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none"
              style={{background: 'linear-gradient(160deg, #0d2137 0%, #1e3a5f 60%, #0a1a2e 100%)'}}>
              {testVideoUrl ? (
                <p className="text-white/50 text-sm font-mono animate-pulse">載入影片辨識中…</p>
              ) : camError ? (
                <>
                  <p className="text-red-300 text-sm font-mono text-center px-6">{camError}</p>
                </>
              ) : (
                <>
                  <p className="text-white/50 text-sm font-mono animate-pulse">開啟攝影機中…</p>
                </>
              )}
            </div>
          )}

          <div className="absolute top-0 inset-x-0 h-32 bg-linear-to-b from-black/70 to-transparent z-10 pointer-events-none"></div>

          {/* AI Scanning overlay */}
          {videoFeedReady && (
            <div className="absolute inset-0 pointer-events-none z-10">
              <motion.div
                animate={{ y: ['0%', '100%', '0%'] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                className="w-full h-0.5 bg-primary/40 shadow-[0_0_8px_rgba(var(--color-primary),0.8)]"
              />
              {/* Dynamic detection box based on Gemini result */}
              {camScene && (
                <motion.div
                  key={camScene + camZone}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute top-[25%] left-[28%] w-[18%] h-[22%] border-2 border-primary/70 rounded-lg"
                >
                  <div className="absolute -top-5 left-0 bg-primary/90 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap">
                    {camZone || '教室前區'} [{camConfidence}%]
                  </div>
                </motion.div>
              )}
              {camScene === 'crowd' || camScene === 'safety' ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute top-[40%] right-[20%] w-[14%] h-[18%] border-2 border-tertiary/80 rounded-lg animate-pulse"
                >
                  <div className="absolute -top-5 left-0 bg-tertiary/90 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap">
                    {SCENE_LABELS[camScene] ?? camScene}
                  </div>
                </motion.div>
              ) : null}
            </div>
          )}

          {/* Bottom info bar */}
          <div className="absolute bottom-0 inset-x-0 z-20 bg-linear-to-t from-black/90 via-black/60 to-transparent pt-16 pb-6 px-6">
            <div className="flex justify-between items-end gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-headline font-bold text-xl drop-shadow-md truncate">
                  {testVideoUrl ? `101 教室 · 影片辨識` : camZone || '101 教室 · 即時場域'}
                </h3>
                <p className="text-white/60 text-sm font-medium mt-1 font-mono">
                  {classroomAnalyzing ? 'AI + YOLO 分析中…' : (videoFeedReady ? (testVideoUrl ? '影片辨識監控中' : 'AI Vision 監控中') : testVideoUrl ? '影片辨識載入中…' : '攝影機啟動中…')}
                </p>
                {testVideoUrl && testVideoName && (
                  <p className="mt-1 truncate text-[10px] font-mono text-white/35">來源檔案：{testVideoName}</p>
                )}
                {(classroomAnalysis || camScene) && !camAnalyzing && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-primary/80 text-white px-2 py-0.5 rounded-full tracking-widest">
                      {classroomAnalysis ? atmosphere.label : SCENE_LABELS[camScene] ?? camScene}
                    </span>
                    <span className="text-[10px] text-white/50 font-mono">
                      {classroomAnalysis ? (classroomAnalysis.source === 'gemini' ? '雲端 AI' : classroomAnalysis.source === 'ollama' ? '本地 AI' : '本地 CV') : (camSource === 'gemini' ? '雲端 AI' : camSource === 'ollama' ? '本地 AI' : '本地分析')}
                    </span>
                  </div>
                )}
                {trackingActive && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-emerald-500/85 text-white px-2 py-0.5 rounded-full tracking-widest">
                      追蹤 {trackedPeople.filter((p) => p.missed === 0).length} 人
                    </span>
                    <span className="text-[10px] text-white/50 font-mono">
                      {trackingSource === 'yolo' ? 'YOLOv8 框選中' : 'YOLO 啟動中'}
                    </span>
                  </div>
                )}
              </div>
              <div className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-lg ${videoFeedReady ? 'bg-error/80 backdrop-blur text-white' : 'bg-black/60 text-white/40'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${videoFeedReady ? 'bg-white animate-pulse' : 'bg-white/30'}`}></div>
                {videoFeedReady ? (testVideoUrl ? '影片辨識' : '實況錄製') : '待機'}
              </div>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Simple Chart Modal */}
      <BottomSheet isOpen={modal === 'chart'} onClose={() => setModal(null)} title="即時專注度分析報表">
         <div className="p-6 flex flex-col items-center py-10">
           <div className="w-28 h-28 rounded-full bg-primary/10 flex items-center justify-center mb-8 relative shadow-inner">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: 'linear' }} className="absolute inset-0 border-[4px] border-dashed border-primary/40 rounded-full"></motion.div>
              <Focus size={52} className="text-primary opacity-90 drop-shadow-md" />
           </div>
           <p className="text-2xl font-headline font-bold mb-3 tracking-wide text-on-surface">分析數據匯總中...</p>
           <p className="text-[15px] text-on-surface-variant font-medium text-center max-w-[320px] leading-relaxed">
             {hasClassroomScan
               ? `目前專注度 ${classroomAnalysis.focusScore}%，班級狀態：${classroomAnalysis.emotionLabel}。`
               : '系統正在等待 AI / 本地分析統整本堂課的影像訊號與氛圍描述。'}
           </p>
           {hasClassroomScan && (
             <div className="mt-6 w-full grid grid-cols-1 gap-2">
               {classroomAnalysis.evidence.slice(0, 3).map((item) => (
                 <div key={item} className="bg-surface-container px-4 py-3 rounded-xl text-xs font-medium text-on-surface-variant border border-outline-variant/30">
                   {item}
                 </div>
               ))}
             </div>
           )}
           <button onClick={downloadReport} className="mt-10 bg-primary hover:bg-primary/95 text-white py-5 px-8 rounded-[1.5rem] font-bold text-[17px] tracking-widest active:scale-[0.98] shadow-[0_0_20px_rgba(var(--color-primary),0.4)] w-full transition-all flex items-center justify-center gap-2 border border-primary/20">
             匯出完整 PDF 報告
           </button>
         </div>
      </BottomSheet>
    </div>
  );
}
