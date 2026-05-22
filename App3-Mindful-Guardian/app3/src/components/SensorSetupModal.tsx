import {useRef, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {
  Bot,
  CheckCircle2,
  Cpu,
  Droplets,
  Zap,
  Sun,
  Thermometer,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type {DetectedPort, ZoneSensorReading} from '../types';
import {assignDrivePort, assignSensorPort, testDriveMotor, testSensorLed} from '../services/hardwareBridge';

const ZONES: {id: string; name: string; emoji: string; bg: string; border: string; activeBg: string; activeText: string; dot: string}[] = [
  {
    id: 'zone-library',
    name: '圖書館',
    emoji: '📚',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    activeBg: 'bg-sky-100',
    activeText: 'text-sky-900',
    dot: 'bg-sky-400',
  },
  {
    id: 'zone-hall',
    name: '穿堂',
    emoji: '🚶',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    activeBg: 'bg-emerald-100',
    activeText: 'text-emerald-900',
    dot: 'bg-emerald-400',
  },
  {
    id: 'zone-field',
    name: '操場',
    emoji: '⚽',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    activeBg: 'bg-amber-100',
    activeText: 'text-amber-900',
    dot: 'bg-amber-400',
  },
];

function deviceLabel(index: number) {
  return `感測器 ${String.fromCharCode(65 + index)}`;
}

interface Props {
  ports: DetectedPort[];
  drivePorts: DetectedPort[];
  sensors: ZoneSensorReading[];
  onClose: () => void;
  onChanged: () => void;
}

export function SensorSetupModal({ports, drivePorts, sensors, onClose, onChanged}: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(
    () => ports.find((p) => !p.assignedZone)?.path ?? ports[0]?.path ?? null,
  );
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [testBusyPath, setTestBusyPath] = useState<string | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedPort = ports.find((p) => p.path === selectedPath) ?? null;
  const assignedDrivePort = drivePorts.find((p) => p.assignedDrive) ?? null;

  const triggerFlash = (id: string) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlash(id);
    flashTimerRef.current = setTimeout(() => setFlash(null), 1400);
  };

  const handleAssign = async (zoneId: string) => {
    if (!selectedPath || busyPath) return;
    setBusyPath(selectedPath);

    // Swap: if another port owns this zone, release it first
    const blocker = ports.find((p) => p.path !== selectedPath && p.assignedZone === zoneId);
    if (blocker) await assignSensorPort(blocker.path, null);

    const ok = await assignSensorPort(selectedPath, zoneId);
    setBusyPath(null);
    if (ok) {
      triggerFlash(zoneId);
      onChanged();
    }
  };

  const handleUnassign = async (portPath: string) => {
    if (busyPath) return;
    setBusyPath(portPath);
    await assignSensorPort(portPath, null);
    setBusyPath(null);
    onChanged();
  };

  const handleLedTest = async (portPath: string) => {
    if (testBusyPath) return;
    setTestBusyPath(portPath);
    setTestMessage(null);
    const result = await testSensorLed(portPath);
    setTestBusyPath(null);
    setTestMessage(result.ok ? '已送出閃燈測試，請看目前選取的感測板' : result.message);
    if (result.ok) triggerFlash(portPath);
  };

  const handleDriveAssign = async (portPath: string | null) => {
    if (driveBusy) return;
    setDriveBusy(true);
    setTestMessage(null);
    const result = await assignDrivePort(portPath);
    setDriveBusy(false);
    setTestMessage(result.ok ? (portPath ? '移動底盤板已指派' : '已解除移動底盤板') : result.message);
    if (result.ok) {
      if (portPath) triggerFlash(portPath);
      onChanged();
    }
  };

  const handleDriveTest = async () => {
    if (driveBusy) return;
    setDriveBusy(true);
    setTestMessage(null);
    const result = await testDriveMotor();
    setDriveBusy(false);
    setTestMessage(result.ok ? '已送出底盤馬達測試' : result.message);
    if (result.ok && assignedDrivePort) triggerFlash(assignedDrivePort.path);
  };

  const sensorFor = (zoneId: string) => sensors.find((s) => s.zoneId === zoneId);
  const sensorForPort = (port: DetectedPort) =>
    sensors.find((s) => s.portPath === port.path) ??
    (port.assignedZone ? sensorFor(port.assignedZone) : undefined);

  const hasAnyPort = ports.length > 0 || drivePorts.length > 0;
  const allAssigned = ports.length > 0 && ports.every((p) => p.assignedZone);

  return (
    <motion.div
      initial={{opacity: 0}}
      animate={{opacity: 1}}
      exit={{opacity: 0}}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{y: 80, opacity: 0, scale: 0.98}}
        animate={{y: 0, opacity: 1, scale: 1}}
        exit={{y: 80, opacity: 0, scale: 0.98}}
        transition={{type: 'spring', damping: 30, stiffness: 320}}
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        style={{maxHeight: '92dvh'}}
      >
        {/* ── Header ── */}
        <div className="flex shrink-0 items-center justify-between bg-linear-to-r from-teal-600 to-teal-700 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
              <Wifi className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">感測器配對</h2>
              <p className="text-xs text-teal-200">讓感測器守護每個空間</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white transition hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

          {/* No ports */}
          {!hasAnyPort && (
            <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
              <div className="rounded-full bg-slate-100 p-6">
                <WifiOff className="h-10 w-10 text-slate-400" />
              </div>
              <div>
                <p className="text-lg font-black text-slate-700">找不到感測器</p>
                <p className="mt-1 text-sm text-slate-500">請確認 USB 線已插好，系統會自動偵測</p>
              </div>
            </div>
          )}

          {hasAnyPort && (
            <div className="space-y-6 px-5 py-5">

              {/* ── Step 1: device selection ── */}
              {ports.length > 0 && (
                <section>
                  <p className="mb-3 text-[11px] font-black uppercase tracking-widest text-slate-400">
                    步驟一・選擇感測器
                  </p>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {ports.map((port, i) => {
                    const isSelected = port.path === selectedPath;
                    const isBusy = busyPath === port.path;
                    const zoneMeta = ZONES.find((z) => z.id === port.assignedZone);
                    const sensor = sensorForPort(port);

                    return (
                      <button
                        key={port.path}
                        onClick={() => setSelectedPath(port.path)}
                        disabled={isBusy}
                        className={[
                          'relative w-40 shrink-0 rounded-2xl border-2 p-4 text-left transition-all',
                          isSelected
                            ? 'border-teal-500 bg-teal-50 shadow-lg ring-2 ring-teal-200'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm',
                        ].join(' ')}
                      >
                        {/* Icon */}
                        <div
                          className={[
                            'mb-3 inline-flex rounded-xl p-2',
                            isSelected ? 'bg-teal-100' : 'bg-slate-100',
                          ].join(' ')}
                        >
                          <Cpu
                            className={['h-5 w-5', isSelected ? 'text-teal-600' : 'text-slate-500'].join(' ')}
                          />
                        </div>

                        {/* Name */}
                        <p
                          className={[
                            'text-sm font-black',
                            isSelected ? 'text-teal-900' : 'text-slate-700',
                          ].join(' ')}
                        >
                          {deviceLabel(i)}
                        </p>

                        {/* Zone badge */}
                        {zoneMeta ? (
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className={['h-2 w-2 rounded-full', zoneMeta.dot].join(' ')} />
                            <span className="text-xs font-semibold text-slate-600">{zoneMeta.name}</span>
                          </div>
                        ) : (
                          <p className="mt-1 text-xs text-slate-400">尚未指派</p>
                        )}

                        {/* Mini live reading */}
                        {sensor?.connected && (
                          <p className="mt-2 text-[11px] tabular-nums text-slate-500">
                            {sensor.temp?.toFixed(1)}°C · {sensor.hum}%
                          </p>
                        )}

                        {/* Selected check */}
                        {isSelected && (
                          <div className="absolute -right-1.5 -top-1.5 rounded-full bg-teal-500 p-0.5 shadow">
                            <CheckCircle2 className="h-4 w-4 text-white" />
                          </div>
                        )}

                        {/* Busy spinner */}
                        {isBusy && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
                          </div>
                        )}
                      </button>
                    );
                    })}
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-teal-100 bg-teal-50/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-teal-700">
                      第四顆 Arduino・移動底盤
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      R4 Minima + L293D，專門接收方向鍵與速度指令
                    </p>
                  </div>
                  <div className={[
                    'rounded-full px-3 py-1 text-[11px] font-black',
                    assignedDrivePort?.connected ? 'bg-emerald-100 text-emerald-700' : assignedDrivePort ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500',
                  ].join(' ')}>
                    {assignedDrivePort?.connected ? '已連線' : assignedDrivePort ? '已指派' : '未指派'}
                  </div>
                </div>

                <div className="flex gap-3 overflow-x-auto pb-1">
                  {drivePorts.map((port, i) => {
                    const isDrive = port.assignedDrive === true;
                    const isSensor = !!port.assignedZone;
                    const isFlashing = flash === port.path;
                    return (
                      <div
                        key={port.path}
                        className={[
                          'relative w-44 shrink-0 rounded-2xl border-2 p-4 text-left transition-all',
                          isDrive
                            ? 'border-teal-500 bg-white shadow-md ring-2 ring-teal-200'
                            : 'border-white bg-white/80 hover:border-teal-200 hover:shadow-sm',
                          driveBusy ? 'opacity-60' : '',
                        ].join(' ')}
                      >
                        <AnimatePresence>
                          {isFlashing && (
                            <motion.div
                              initial={{opacity: 0.5}}
                              animate={{opacity: 0}}
                              exit={{opacity: 0}}
                              transition={{duration: 1.2}}
                              className="pointer-events-none absolute inset-0 rounded-2xl bg-teal-300"
                            />
                          )}
                        </AnimatePresence>
                        <div className="mb-3 inline-flex rounded-xl bg-teal-100 p-2">
                          <Bot className="h-5 w-5 text-teal-700" />
                        </div>
                        <p className="text-sm font-black text-slate-800">底盤板 {i + 1}</p>
                        <p className="mt-1 truncate text-[10px] font-mono text-slate-400">{port.path}</p>
                        {isSensor && !isDrive && (
                          <p className="mt-2 text-[11px] font-semibold text-amber-600">目前是感測器，先解除感測器用途再設為底盤</p>
                        )}
                        {isDrive && (
                          <div className="absolute -right-1.5 -top-1.5 rounded-full bg-teal-500 p-0.5 shadow">
                            <CheckCircle2 className="h-4 w-4 text-white" />
                          </div>
                        )}
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleDriveAssign(port.path)}
                            disabled={driveBusy || isDrive || isSensor}
                            className="rounded-xl bg-slate-900 px-2 py-2 text-[11px] font-black text-white transition hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            設為底盤
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDriveAssign(null)}
                            disabled={driveBusy || !isDrive}
                            className="rounded-xl bg-white px-2 py-2 text-[11px] font-black text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:text-slate-300"
                          >
                            解除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDriveTest}
                    disabled={driveBusy || !assignedDrivePort}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40"
                  >
                    <Zap className={['h-4 w-4', driveBusy ? 'animate-pulse' : ''].join(' ')} />
                    底盤測試
                  </button>
                  {assignedDrivePort && (
                    <button
                      type="button"
                      onClick={() => handleDriveAssign(null)}
                      disabled={driveBusy}
                      className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-40"
                    >
                      解除底盤
                    </button>
                  )}
                </div>
              </section>

              {/* ── Step 2: zone grid ── */}
              <AnimatePresence mode="wait">
                {selectedPort && (
                  <motion.section
                    key={selectedPath}
                    initial={{opacity: 0, y: 10}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: -6}}
                    transition={{duration: 0.18}}
                  >
                    <p className="mb-3 text-[11px] font-black uppercase tracking-widest text-slate-400">
                      步驟二・指派到空間
                      {selectedPort.assignedZone && (
                        <span className="ml-2 font-semibold normal-case text-slate-500">
                          （目前：{ZONES.find((z) => z.id === selectedPort.assignedZone)?.name}）
                        </span>
                      )}
                    </p>

                    <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-slate-700">辨識目前感測板</p>
                          <p className="mt-0.5 truncate text-[10px] font-mono text-slate-400">{selectedPort.path}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLedTest(selectedPort.path)}
                          disabled={!!testBusyPath || !!busyPath}
                          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
                        >
                          <Zap className={['h-4 w-4', testBusyPath === selectedPort.path ? 'animate-pulse' : ''].join(' ')} />
                          {testBusyPath === selectedPort.path ? '測試中' : '閃燈測試'}
                        </button>
                      </div>
                      {testMessage && (
                        <p className="mt-2 text-[11px] font-semibold text-slate-500">{testMessage}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {ZONES.map((zone) => {
                        const isAssigned = selectedPort.assignedZone === zone.id;
                        const takenByOther = ports.some(
                          (p) => p.path !== selectedPath && p.assignedZone === zone.id,
                        );
                        const sensor = sensorFor(zone.id);
                        const isFlashing = flash === zone.id;

                        return (
                          <motion.div
                            key={zone.id}
                            whileTap={{scale: 0.95}}
                            className={[
                              'relative rounded-2xl border-2 p-4 text-left transition-all',
                              isAssigned
                                ? 'border-teal-500 bg-teal-50 shadow-md'
                                : `${zone.bg} ${zone.border} hover:shadow-sm`,
                              busyPath ? 'opacity-60' : '',
                            ].join(' ')}
                          >
                            {/* Flash overlay on success */}
                            <AnimatePresence>
                              {isFlashing && (
                                <motion.div
                                  initial={{opacity: 0.6}}
                                  animate={{opacity: 0}}
                                  exit={{opacity: 0}}
                                  transition={{duration: 1.2}}
                                  className="pointer-events-none absolute inset-0 rounded-2xl bg-teal-300"
                                />
                              )}
                            </AnimatePresence>

                            {/* Top row: emoji + checkmark */}
                            <div className="flex items-start justify-between gap-1">
                              <span className="text-2xl">{zone.emoji}</span>
                              {isAssigned && (
                                <motion.div
                                  initial={{scale: 0}}
                                  animate={{scale: 1}}
                                  className="rounded-full bg-teal-500 p-0.5 shadow"
                                >
                                  <CheckCircle2 className="h-4 w-4 text-white" />
                                </motion.div>
                              )}
                            </div>

                            {/* Zone name */}
                            <p
                              className={[
                                'mt-2 text-sm font-black',
                                isAssigned ? 'text-teal-800' : zone.activeText,
                              ].join(' ')}
                            >
                              {zone.name}
                            </p>

                            {/* "other port here" warning */}
                            {takenByOther && !isAssigned && (
                              <p className="mt-0.5 text-[11px] font-semibold text-amber-600">
                                其他感測器使用中
                              </p>
                            )}

                            {/* Live reading */}
                            {sensor?.connected && (
                              <div className="mt-2 space-y-0.5">
                                <div className="flex items-center gap-1 text-[11px] tabular-nums text-slate-600">
                                  <Thermometer className="h-3 w-3" />
                                  <span>{sensor.temp?.toFixed(1)}°C</span>
                                  <Droplets className="ml-1 h-3 w-3" />
                                  <span>{sensor.hum}%</span>
                                </div>
                                <div className="flex items-center gap-1 text-[11px] tabular-nums text-slate-400">
                                  <Sun className="h-3 w-3" />
                                  <span>光線 {sensor.light}</span>
                                </div>
                              </div>
                            )}

                            {/* Unassign hint */}
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => handleAssign(zone.id)}
                                disabled={!!busyPath || isAssigned}
                                className="rounded-xl bg-teal-600 px-2 py-2 text-[11px] font-black text-white transition hover:bg-teal-700 disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                指派
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUnassign(selectedPath!)}
                                disabled={!!busyPath || !isAssigned}
                                className="rounded-xl bg-white px-2 py-2 text-[11px] font-black text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:text-slate-300"
                              >
                                解除
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>

              {/* ── All-done banner ── */}
              <AnimatePresence>
                {allAssigned && (
                  <motion.div
                    initial={{opacity: 0, scale: 0.96}}
                    animate={{opacity: 1, scale: 1}}
                    exit={{opacity: 0, scale: 0.96}}
                    className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"
                  >
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                    <div>
                      <p className="text-sm font-black text-emerald-800">所有感測器已配對完成！</p>
                      <p className="text-xs text-emerald-600">資料會自動更新，設定已儲存</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          )}
        </div>

        {/* ── Footer button ── */}
        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-2xl bg-teal-600 py-3.5 text-sm font-black text-white shadow transition hover:bg-teal-700 active:scale-95"
          >
            {allAssigned ? '完成設定 ✓' : '關閉'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
