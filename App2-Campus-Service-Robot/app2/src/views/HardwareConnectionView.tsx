import {type ReactNode, useEffect, useMemo, useState} from 'react';
import {ArrowLeft, Bot, Camera, CheckCircle2, PlugZap, RefreshCw, TriangleAlert, XCircle} from 'lucide-react';
import {getHardwareHealth, sendHardwareCommand, type HardwareHealthResult} from '../services/hardwareBridge';

type StatusKind = 'checking' | 'ok' | 'warn' | 'error';

type CameraStatus = {
  kind: StatusKind;
  title: string;
  detail: string;
  count: number;
};

const INITIAL_CAMERA: CameraStatus = {
  kind: 'checking',
  title: '尚未檢查',
  detail: '點重新檢查後會確認這台電腦的攝像頭權限與可用狀態。',
  count: 0,
};

function statusStyle(kind: StatusKind) {
  switch (kind) {
    case 'ok':
      return {
        icon: <CheckCircle2 className="h-5 w-5" />,
        badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
        card: 'border-emerald-200 bg-emerald-50/30',
      };
    case 'warn':
      return {
        icon: <TriangleAlert className="h-5 w-5" />,
        badge: 'bg-amber-50 text-amber-700 ring-amber-200',
        card: 'border-amber-200 bg-amber-50/35',
      };
    case 'error':
      return {
        icon: <XCircle className="h-5 w-5" />,
        badge: 'bg-rose-50 text-rose-700 ring-rose-200',
        card: 'border-rose-200 bg-rose-50/30',
      };
    default:
      return {
        icon: <RefreshCw className="h-5 w-5 animate-spin" />,
        badge: 'bg-slate-50 text-slate-600 ring-slate-200',
        card: 'border-outline-variant/20 bg-surface-container-low/50',
      };
  }
}

function StatusCard({
  icon,
  label,
  title,
  detail,
  kind,
  children,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  detail: string;
  kind: StatusKind;
  children?: ReactNode;
}) {
  const style = statusStyle(kind);
  return (
    <section className={`rounded-2xl border p-5 shadow-sm ${style.card}`}>
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-container-lowest text-primary shadow-sm ring-1 ring-outline-variant/20">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant">{label}</p>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${style.badge}`}>
              {style.icon}
              {kind === 'ok' ? '正常' : kind === 'warn' ? '注意' : kind === 'error' ? '異常' : '檢查中'}
            </span>
          </div>
          <h2 className="mt-2 text-xl font-black tracking-tight text-on-surface">{title}</h2>
          <p className="mt-1 text-sm font-bold leading-relaxed text-on-surface-variant">{detail}</p>
          {children && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </section>
  );
}

export function HardwareConnectionView({goBack, showToast}: {goBack: () => void; showToast: (message: string) => void}) {
  const [camera, setCamera] = useState<CameraStatus>(INITIAL_CAMERA);
  const [hardware, setHardware] = useState<HardwareHealthResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [testingChassis, setTestingChassis] = useState(false);

  const chassisKind: StatusKind = useMemo(() => {
    if (!hardware) return 'checking';
    if (hardware.arduinoConnected) return 'ok';
    if (hardware.bridgeOnline) return 'warn';
    return 'error';
  }, [hardware]);

  const checkCamera = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setCamera({
        kind: 'error',
        title: '瀏覽器不支援攝像頭檢查',
        detail: '這個頁面需要 mediaDevices API 才能檢查電腦攝像頭。',
        count: 0,
      });
      return;
    }

    try {
      const before = await navigator.mediaDevices.enumerateDevices();
      const beforeCameras = before.filter((device) => device.kind === 'videoinput');
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({video: true, audio: false});
      } finally {
        stream?.getTracks().forEach((track) => track.stop());
      }
      const after = await navigator.mediaDevices.enumerateDevices();
      const cameras = after.filter((device) => device.kind === 'videoinput');
      const count = Math.max(cameras.length, beforeCameras.length);
      setCamera({
        kind: count > 0 ? 'ok' : 'warn',
        title: count > 0 ? '電腦攝像頭可用' : '沒有列出攝像頭',
        detail: count > 0
          ? `偵測到 ${count} 個攝像頭，瀏覽器權限已確認。`
          : '瀏覽器權限可開啟，但系統沒有回報攝像頭裝置。',
        count,
      });
    } catch (error) {
      const err = error instanceof DOMException ? error.name : '';
      setCamera({
        kind: err === 'NotAllowedError' ? 'warn' : 'error',
        title: err === 'NotAllowedError' ? '攝像頭權限未允許' : '攝像頭無法啟動',
        detail: error instanceof Error ? error.message : '請確認電腦攝像頭已連接，並允許瀏覽器使用。',
        count: 0,
      });
    }
  };

  const checkHardware = async () => {
    const health = await getHardwareHealth();
    setHardware(health);
    return health;
  };

  const runAllChecks = async () => {
    setChecking(true);
    setCamera((prev) => ({...prev, kind: 'checking', title: '檢查中', detail: '正在檢查這台電腦的攝像頭。'}));
    try {
      await Promise.all([checkHardware(), checkCamera()]);
      showToast('硬體連線檢查完成');
    } finally {
      setChecking(false);
    }
  };

  const testChassis = async () => {
    setTestingChassis(true);
    try {
      const health = await checkHardware();
      if (!health.arduinoConnected) {
        showToast(health.bridgeOnline ? 'Arduino 尚未連線，改用離線可測底盤流程' : 'Bridge 尚未啟動，改用離線可測底盤流程');
      }
      const result = await sendHardwareCommand('CHASSIS_TEST', 'app2:hardware-page');
      showToast(result.ok ? (result.simulated ? '底盤校驗已完成離線指令記錄' : '底盤校驗已送出') : result.message);
    } finally {
      setTestingChassis(false);
    }
  };

  useEffect(() => {
    void runAllChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 pb-12 pt-5 sm:px-6 md:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 pb-5">
          <button
            type="button"
            onClick={goBack}
            className="flex h-11 items-center gap-2 rounded-2xl bg-surface-container-low px-4 text-sm font-black text-on-surface-variant ring-1 ring-outline-variant/20 transition hover:text-on-surface active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
          <button
            type="button"
            onClick={runAllChecks}
            disabled={checking}
            className="flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90 active:scale-95 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
            重新檢查
          </button>
        </header>

        <div className="py-6">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-primary">Hardware Connection</p>
          <h1 className="mt-2 font-headline text-3xl font-black tracking-tight text-on-surface sm:text-4xl">硬體連線檢查</h1>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <StatusCard
            icon={<Camera className="h-6 w-6" />}
            label="電腦攝像頭"
            title={camera.title}
            detail={camera.detail}
            kind={camera.kind}
          >
            <p className="text-xs font-bold text-on-surface-variant">偵測數量：{camera.count}</p>
          </StatusCard>

          <StatusCard
            icon={<Bot className="h-6 w-6" />}
            label="Arduino 底盤"
            title={hardware?.arduinoConnected ? 'Arduino 底盤已連線' : hardware?.bridgeOnline ? 'Bridge 已啟動，等待 Arduino' : 'Bridge 離線'}
            detail={hardware?.message ?? '正在讀取 Arduino bridge health。'}
            kind={chassisKind}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-surface-container-lowest px-3 py-1 text-xs font-black text-on-surface-variant ring-1 ring-outline-variant/20">
                連接埠：{hardware?.activePath ?? '無'}
              </span>
              <button
                type="button"
                onClick={testChassis}
                disabled={testingChassis}
                className="flex h-10 items-center gap-2 rounded-xl bg-primary/10 px-3 text-xs font-black text-primary ring-1 ring-primary/20 transition hover:bg-primary/15 active:scale-95 disabled:opacity-60"
              >
                <PlugZap className="h-4 w-4" />
                {testingChassis ? '校驗中' : '校驗底盤'}
              </button>
            </div>
          </StatusCard>

        </div>
      </div>
    </div>
  );
}
