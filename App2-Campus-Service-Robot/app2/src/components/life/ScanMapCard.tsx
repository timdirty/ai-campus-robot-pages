import {useCallback, useEffect, useRef, useState} from 'react';
import {motion} from 'motion/react';
import {Camera, Megaphone, Upload} from 'lucide-react';
import {
  analyzeClassroomPixels,
  captureClassroomFrame,
  detectClassroomPeople,
  type ClassroomCvSignals,
  type ClassroomPersonDetection,
} from '../../services/classroomVision';

const SCAN_ZONES = [
  {id: 'b4', label: 'B-4 走廊', hint: '下課走廊人流'},
  {id: 'a2', label: 'A-2 入口', hint: '校門與穿堂入口'},
  {id: 'ops', label: '操場出口', hint: '操場回流動線'},
] as const;

const CV_INTERVAL_MS = 220;
const YOLO_INTERVAL_MS = 800;
const CROWD_YOLO_OPTIONS = {confidence: 0.15, imageSize: 1280, iou: 0.50};

type ZoneId = typeof SCAN_ZONES[number]['id'];
type ZoneLevel = 'ok' | 'warn' | 'error';

const DEFAULT_ZONE_VIDEOS: Record<ZoneId, {url: string; name: string}> = {
  b4: {url: './life-videos/gate-entrance.mp4', name: '校門與穿堂入口.mp4'},
  a2: {url: './life-videos/corridor.mp4', name: '走廊畫面.mp4'},
  ops: {url: './life-videos/playground-flow.mp4', name: '操場回流動線.mp4'},
};

type ZoneBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ZoneState = {
  count: number | null;
  level: ZoneLevel;
  status: string;
  summary: string;
  source: 'waiting' | 'cv' | 'yolo';
  updatedAt: string | null;
  flowScore: number;
  boxes: ZoneBox[];
  videoName: string | null;
};

const initialZoneState = (): ZoneState => ({
  count: null,
  level: 'ok',
  status: '等待影片',
  summary: '放入影片後，系統會把影片作為即時影像來源，持續做 YOLO + CV 人流偵測。',
  source: 'waiting',
  updatedAt: null,
  flowScore: 0,
  boxes: [],
  videoName: null,
});

function levelFromCount(count: number): ZoneLevel {
  if (count >= 14) return 'error';
  if (count >= 8) return 'warn';
  return 'ok';
}

function statusFromLevel(level: ZoneLevel) {
  if (level === 'error') return '人流壅塞';
  if (level === 'warn') return '人流偏高';
  return '正常通行';
}

function flowScoreFromCv(cv: ClassroomCvSignals, count: number) {
  const countScore = Math.min(52, count * 4);
  const motionScore = Math.min(38, cv.motionLevel * 0.58);
  const edgeScore = Math.min(10, cv.edgeDensity * 0.12);
  return Math.max(0, Math.min(100, Math.round(countScore + motionScore + edgeScore)));
}

function speedRiskLabel(state: ZoneState) {
  if (state.count === null) return '待測';
  if (state.flowScore >= 88 || state.level === 'error') return '過快';
  if (state.flowScore >= 70 || state.level === 'warn') return '偏快';
  return '正常';
}

function safetyBroadcastMessage(zoneLabel: string, state: ZoneState) {
  if (state.flowScore >= 88 || state.level === 'error') {
    return `${zoneLabel} 人流與移動速度偏高，請同學停止奔跑、靠右慢行，避免推擠與滑倒。`;
  }
  return `${zoneLabel} 下課人流增加，請同學放慢腳步、靠右通行，通過轉角與樓梯請注意安全。`;
}

function levelColor(level: ZoneLevel) {
  return level === 'error' ? 'text-error' : level === 'warn' ? 'text-amber-400' : 'text-[#87d46c]';
}

function levelDot(level: ZoneLevel) {
  return level === 'error' ? 'bg-error' : level === 'warn' ? 'bg-amber-400' : 'bg-[#87d46c]';
}

function formatTime(iso: string | null) {
  if (!iso) return '--:--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function boxesFromDetections(detections: ClassroomPersonDetection[], width: number, height: number): ZoneBox[] {
  return detections.slice(0, 32).map((detection) => {
    const [x1, y1, x2, y2] = detection.box;
    return {
      x: Math.max(0, Math.min(100, (x1 / Math.max(1, width)) * 100)),
      y: Math.max(0, Math.min(100, (y1 / Math.max(1, height)) * 100)),
      width: Math.max(1, Math.min(100, ((x2 - x1) / Math.max(1, width)) * 100)),
      height: Math.max(1, Math.min(100, ((y2 - y1) / Math.max(1, height)) * 100)),
    };
  });
}

function buildYoloZoneState(
  cv: ClassroomCvSignals,
  detections: ClassroomPersonDetection[],
  captureSize: {width: number; height: number},
  source: 'cv' | 'yolo',
  videoName: string | null,
): ZoneState {
  const count = detections.length > 0 ? detections.length : cv.estimatedPeople;
  const level = levelFromCount(count);
  const flowScore = flowScoreFromCv(cv, count);
  return {
    count,
    level,
    status: statusFromLevel(level),
    summary: `YOLO ${detections.length || '--'} 人，CV 動作量 ${cv.motionLevel}，流動度 ${flowScore}%。`,
    source,
    updatedAt: new Date().toISOString(),
    flowScore,
    boxes: detections.length ? boxesFromDetections(detections, captureSize.width, captureSize.height) : [],
    videoName,
  };
}

function buildCvZoneState(cv: ClassroomCvSignals, previous: ZoneState, videoName: string | null): ZoneState {
  const count = previous.source === 'yolo' && previous.count !== null ? previous.count : cv.estimatedPeople;
  const level = levelFromCount(count);
  const flowScore = flowScoreFromCv(cv, count);
  return {
    ...previous,
    count,
    level,
    status: statusFromLevel(level),
    summary: `${previous.source === 'yolo' ? `YOLO ${count} 人，` : `CV 暫估 ${count} 人，`}動作量 ${cv.motionLevel}，流動度 ${flowScore}%。`,
    source: previous.source === 'yolo' ? 'yolo' : 'cv',
    updatedAt: new Date().toISOString(),
    flowScore,
    videoName,
  };
}

export function ScanMapCard({
  active = true,
  onSafetyBroadcast,
}: {
  active?: boolean;
  onSafetyBroadcast?: (payload: {zone: string; message: string}) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const previousFramesRef = useRef<Record<string, Uint8ClampedArray | null>>({});
  const videoUrlsRef = useRef<Record<string, string>>(
    Object.fromEntries(SCAN_ZONES.map(zone => [zone.id, DEFAULT_ZONE_VIDEOS[zone.id].url])),
  );
  const cvScanZoneIdxRef = useRef(0);
  const yoloScanZoneIdxRef = useRef(0);
  const yoloAnalyzingRef = useRef<Record<string, boolean>>({});
  const [scanZoneIdx, setScanZoneIdx] = useState(0);
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>(() =>
    Object.fromEntries(SCAN_ZONES.map(zone => [zone.id, DEFAULT_ZONE_VIDEOS[zone.id].url])),
  );
  const [zoneStates, setZoneStates] = useState<Record<string, ZoneState>>(() =>
    Object.fromEntries(
      SCAN_ZONES.map(zone => [
        zone.id,
        {
          ...initialZoneState(),
          videoName: DEFAULT_ZONE_VIDEOS[zone.id].name,
        },
      ]),
    ),
  );
  const [analyzingZone, setAnalyzingZone] = useState<ZoneId | null>(null);

  useEffect(() => () => {
    Object.values(videoUrlsRef.current)
      .filter(url => url.startsWith('blob:'))
      .forEach(url => URL.revokeObjectURL(url));
  }, []);

  const handleVideoFile = (zoneId: ZoneId, file: File | undefined) => {
    if (!file) return;
    const previous = videoUrlsRef.current[zoneId];
    if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous);
    const url = URL.createObjectURL(file);
    videoUrlsRef.current = {...videoUrlsRef.current, [zoneId]: url};
    setVideoUrls(prev => ({...prev, [zoneId]: url}));
    previousFramesRef.current[zoneId] = null;
    setZoneStates(prev => ({
      ...prev,
      [zoneId]: {
        ...initialZoneState(),
        status: '影片載入中',
        summary: `${file.name} 已放入，開始作為即時影像來源。`,
        videoName: file.name,
      },
    }));
  };

  const updateCvZone = useCallback((zoneId: ZoneId) => {
    if (!active) return;
    const video = videoRefs.current[zoneId];
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    const capture = captureClassroomFrame(video, canvasRef.current, 360, 0.62);
    if (!capture) return;

    const cv = analyzeClassroomPixels(capture.width, capture.height, capture.data, previousFramesRef.current[zoneId]);
    previousFramesRef.current[zoneId] = new Uint8ClampedArray(capture.data);
    setZoneStates(prev => ({
      ...prev,
      [zoneId]: buildCvZoneState(cv, prev[zoneId] ?? initialZoneState(), prev[zoneId]?.videoName ?? null),
    }));
  }, [active]);

  const updateYoloZone = useCallback(async (zoneId: ZoneId) => {
    if (!active || yoloAnalyzingRef.current[zoneId]) return;
    const video = videoRefs.current[zoneId];
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    const capture = captureClassroomFrame(video, canvasRef.current, 1280, 0.86);
    if (!capture) return;

    yoloAnalyzingRef.current[zoneId] = true;
    setAnalyzingZone(zoneId);
    try {
      const cv = analyzeClassroomPixels(capture.width, capture.height, capture.data, previousFramesRef.current[zoneId]);
      const people = await detectClassroomPeople(capture, undefined, CROWD_YOLO_OPTIONS);
      previousFramesRef.current[zoneId] = new Uint8ClampedArray(capture.data);
      setZoneStates(prev => ({
        ...prev,
        [zoneId]: buildYoloZoneState(
          cv,
          people.detections,
          {width: capture.width, height: capture.height},
          people.source === 'yolo' && people.detections.length > 0 ? 'yolo' : 'cv',
          prev[zoneId]?.videoName ?? null,
        ),
      }));
    } finally {
      yoloAnalyzingRef.current[zoneId] = false;
      setAnalyzingZone(null);
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const availableZones = SCAN_ZONES.filter(zone => videoUrlsRef.current[zone.id]);
      if (!availableZones.length) return;
      const next = availableZones[cvScanZoneIdxRef.current % availableZones.length];
      cvScanZoneIdxRef.current = (cvScanZoneIdxRef.current + 1) % availableZones.length;
      setScanZoneIdx(SCAN_ZONES.findIndex(zone => zone.id === next.id));
      updateCvZone(next.id);
    };
    tick();
    const intv = setInterval(tick, CV_INTERVAL_MS);
    return () => clearInterval(intv);
  }, [active, updateCvZone, videoUrls]);

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const availableZones = SCAN_ZONES.filter(zone => videoUrlsRef.current[zone.id]);
      if (!availableZones.length) return;
      const next = availableZones[yoloScanZoneIdxRef.current % availableZones.length];
      yoloScanZoneIdxRef.current = (yoloScanZoneIdxRef.current + 1) % availableZones.length;
      void updateYoloZone(next.id);
    };
    tick();
    const intv = setInterval(tick, YOLO_INTERVAL_MS);
    return () => clearInterval(intv);
  }, [active, updateYoloZone, videoUrls]);

  return (
    <>
      <motion.div
        className="relative overflow-hidden rounded-2xl border-2 border-primary/20 bg-[#0c121d] p-4 shadow-2xl"
        whileHover={{borderColor: 'rgba(var(--color-primary),0.5)'}}
        whileTap={{scale: 0.99}}
      >
        <canvas ref={canvasRef} className="hidden" />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {SCAN_ZONES.map(zone => {
            const state = zoneStates[zone.id] ?? initialZoneState();
            const isAnalyzing = analyzingZone === zone.id;
            const videoUrl = videoUrls[zone.id];
            const riskLabel = speedRiskLabel(state);
            const shouldSuggestBroadcast = state.level !== 'ok' || state.flowScore >= 70;
            return (
              <div
                key={zone.id}
                className={`relative overflow-hidden rounded-2xl border bg-black ${
                  state.level === 'error'
                    ? 'border-error/45'
                    : state.level === 'warn'
                      ? 'border-amber-400/45'
                      : 'border-white/10'
                }`}
              >
                <div className="relative aspect-video bg-[#111827]">
                  {videoUrl ? (
                    <video
                      ref={node => {
                        videoRefs.current[zone.id] = node;
                      }}
                      src={videoUrl}
                      autoPlay
                      playsInline
                      muted
                      loop
                      className="absolute inset-0 h-full w-full object-cover opacity-75"
                      onLoadedData={event => {
                        event.currentTarget.play().catch(() => {});
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#111827]">
                      <Camera size={30} className="text-white/30" />
                      <p className="px-4 text-center text-[11px] font-bold text-white/45">{zone.hint}</p>
                    </div>
                  )}

                  {state.boxes.map((box, index) => (
                    <div
                      key={`${zone.id}-box-${index}`}
                      className="pointer-events-none absolute rounded-md border-2 border-[#87d46c] bg-[#87d46c]/10 shadow-[0_0_14px_rgba(135,212,108,0.35)]"
                      style={{left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%`}}
                    >
                      <span className="absolute -left-0.5 -top-5 rounded bg-[#87d46c] px-1.5 py-0.5 text-[9px] font-black text-[#10200d]">
                        PERSON
                      </span>
                    </div>
                  ))}

                  <div className="absolute left-3 top-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/45 px-2.5 py-1.5 text-white backdrop-blur">
                    <span className={`h-2 w-2 rounded-full ${levelDot(state.level)} ${isAnalyzing ? 'animate-pulse' : ''}`} />
                    <span className="text-[10px] font-black">{isAnalyzing ? '分析中' : state.status}</span>
                  </div>

                  <label className="absolute right-3 top-3 flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-black/55 px-2.5 py-1.5 text-[10px] font-black text-white backdrop-blur transition-colors hover:bg-primary">
                    <Upload size={12} />
                    影片
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={event => handleVideoFile(zone.id, event.currentTarget.files?.[0])}
                    />
                  </label>
                </div>

                <div className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{zone.label}</p>
                      <p className="truncate text-[10px] font-bold text-white/45">{state.videoName ?? zone.hint}</p>
                    </div>
                    <div className={`shrink-0 text-right ${levelColor(state.level)}`}>
                      <div className="font-headline text-2xl font-black leading-none">{state.count ?? '--'}</div>
                      <p className="text-[9px] font-black">人</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-white/5 px-2 py-1.5">
                      <p className="text-[9px] font-bold text-white/35">流動度</p>
                      <p className={`text-sm font-black ${levelColor(state.level)}`}>{state.flowScore || '--'}%</p>
                    </div>
                    <div className="rounded-xl bg-white/5 px-2 py-1.5">
                      <p className="text-[9px] font-bold text-white/35">更新</p>
                      <p className="text-sm font-black text-white/70">{formatTime(state.updatedAt)}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 px-2 py-1.5">
                      <p className="text-[9px] font-bold text-white/35">步速</p>
                      <p className={`text-sm font-black ${shouldSuggestBroadcast ? 'text-amber-300' : 'text-white/70'}`}>{riskLabel}</p>
                    </div>
                  </div>

                  <p className="truncate text-[10px] font-bold text-primary">▸ {state.summary}</p>
                  <button
                    type="button"
                    disabled={!onSafetyBroadcast || !shouldSuggestBroadcast}
                    onClick={() => onSafetyBroadcast?.({zone: zone.label, message: safetyBroadcastMessage(zone.label, state)})}
                    className={`flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border text-[11px] font-black transition active:scale-95 ${
                      shouldSuggestBroadcast
                        ? 'border-amber-300/40 bg-amber-300/15 text-amber-200 hover:bg-amber-300/20'
                        : 'border-white/10 bg-white/5 text-white/35'
                    } disabled:cursor-default`}
                  >
                    <Megaphone size={13} />
                    {shouldSuggestBroadcast ? '廣播慢行提醒' : '通行狀態穩定'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}
