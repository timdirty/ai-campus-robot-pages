import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {CheckCircle2, Clock3, MapPin, Megaphone, MessageSquareText, Radio, ShieldAlert, Sparkles} from 'lucide-react';
import {sendHardwareCommand} from '../../services/hardwareBridge';

interface BroadcastCardProps {
  showToast: (msg: string) => void;
  onDispatch: (payload: {zones: string; message: string; scenarioId: string}) => void;
}

const BROADCAST_ZONES = [
  {id: 'all', label: '全校', detail: '所有廣播節點'},
  {id: 'a', label: 'A 棟穿堂', detail: '入口與行政區'},
  {id: 'b', label: 'B 棟走廊', detail: '教室轉角熱區'},
  {id: 'playground', label: '操場入口', detail: '集合與移動路線'},
  {id: 'store', label: '福利社前', detail: '下課人流排隊'},
] as const;

const BROADCAST_TEMPLATES = [
  {
    id: 'crowd',
    label: '下課疏導',
    command: 'BROADCAST_CROWD',
    tone: 'bg-primary/10 text-primary border-primary/25',
    message: '下課時間請同學靠右慢行，不奔跑、不推擠，依照現場老師與服務機器人指引通行。',
  },
  {
    id: 'rain',
    label: '雨天慢行',
    command: 'BROADCAST_RAIN',
    tone: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    message: '目前地面濕滑，請放慢腳步並收好雨具，通過走廊與樓梯時注意安全。',
  },
  {
    id: 'lost',
    label: '遺失物',
    command: 'BROADCAST_LOST_FOUND',
    tone: 'bg-amber-50 text-amber-700 border-amber-200',
    message: '拾獲物品已送至學務處，請遺失物品的同學下課後前往確認。',
  },
  {
    id: 'assembly',
    label: '集合提醒',
    command: 'BROADCAST_ASSEMBLY',
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    message: '請各班依序整隊前往指定集合區，保持隊伍距離並聽從老師指揮。',
  },
  {
    id: 'emergency',
    label: '安全警示',
    command: 'BROADCAST_EMERGENCY',
    tone: 'bg-error/10 text-error border-error/25',
    message: '請立即停止奔跑並遠離壅塞區域，依照老師指示改走替代路線。',
    confirm: true,
  },
] as const;

type ZoneId = typeof BROADCAST_ZONES[number]['id'];
type TemplateId = typeof BROADCAST_TEMPLATES[number]['id'];

export function BroadcastCard({showToast, onDispatch}: BroadcastCardProps) {
  const [selectedZones, setSelectedZones] = useState<Set<ZoneId>>(new Set(['all']));
  const [templateId, setTemplateId] = useState<TemplateId>('crowd');
  const [customMessage, setCustomMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [lastSent, setLastSent] = useState<{zones: string; message: string; template: string; simulated: boolean} | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTemplate = BROADCAST_TEMPLATES.find((item) => item.id === templateId) ?? BROADCAST_TEMPLATES[0];
  const selectedZoneItems = useMemo(
    () => BROADCAST_ZONES.filter((zone) => selectedZones.has(zone.id)),
    [selectedZones],
  );
  const zonesText = selectedZones.has('all')
    ? '全校'
    : selectedZoneItems.map((zone) => zone.label).join('、');
  const finalMessage = (customMessage.trim() || activeTemplate.message).slice(0, 120);
  const nodeCount = selectedZones.has('all') ? 12 : Math.max(1, selectedZones.size * 3);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      if (sentTimerRef.current) clearTimeout(sentTimerRef.current);
    };
  }, []);

  const toggleBroadcastZone = (zoneId: ZoneId) => {
    if (zoneId === 'all') {
      setSelectedZones(new Set(['all']));
      return;
    }
    const next = new Set(selectedZones);
    next.delete('all');
    if (next.has(zoneId)) next.delete(zoneId);
    else next.add(zoneId);
    if (next.size === 0) next.add('all');
    setSelectedZones(next);
  };

  const sendBroadcast = useCallback(async () => {
    if (sending) return;
    if (!finalMessage.trim()) {
      showToast('請先選擇或輸入廣播內容');
      return;
    }

    if ('confirm' in activeTemplate && activeTemplate.confirm && !confirming) {
      setConfirming(true);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => {
        confirmTimerRef.current = null;
        setConfirming(false);
      }, 2600);
      return;
    }

    onDispatch({zones: zonesText, message: finalMessage, scenarioId: activeTemplate.id});
    setSending(true);
    try {
      const result = await sendHardwareCommand(`${activeTemplate.command}:${zonesText}`, 'life:broadcast');
      setLastSent({zones: zonesText, message: finalMessage, template: activeTemplate.label, simulated: Boolean(result.simulated)});
      setSent(true);
      setConfirming(false);
      showToast(`${result.simulated ? '離線廣播指令已記錄' : '廣播已送出'}：${zonesText}`);
      if (sentTimerRef.current) clearTimeout(sentTimerRef.current);
      sentTimerRef.current = setTimeout(() => {
        sentTimerRef.current = null;
        setSent(false);
      }, 3200);
    } finally {
      setSending(false);
    }
  }, [activeTemplate, confirming, finalMessage, onDispatch, sending, showToast, zonesText]);

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-low shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/20 px-5 py-4">
        <div className="flex items-center gap-2">
          <Radio size={15} className="text-primary" />
          <h3 className="font-headline text-sm font-bold">智慧廣播控制</h3>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black tracking-widest text-primary">
          {selectedZones.has('all') ? '全域' : `${selectedZones.size} 區`}
        </span>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black tracking-widest text-on-surface-variant">
            <MapPin size={12} />
            區域選擇
          </div>
          <div className="grid grid-cols-2 gap-2">
            {BROADCAST_ZONES.map((zone) => {
              const active = selectedZones.has(zone.id);
              return (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => toggleBroadcastZone(zone.id)}
                  className={`min-h-14 rounded-xl border px-3 py-2 text-left transition active:scale-95 ${
                    active
                      ? 'border-primary/45 bg-primary/10 text-primary shadow-sm'
                      : 'border-outline-variant/20 bg-surface-container-lowest text-on-surface-variant hover:border-primary/25'
                  }`}
                >
                  <span className="block text-xs font-black leading-tight">{zone.label}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-bold opacity-60">{zone.detail}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black tracking-widest text-on-surface-variant">
            <Sparkles size={12} />
            情境模板
          </div>
          <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">
            {BROADCAST_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  setTemplateId(template.id);
                  setConfirming(false);
                }}
                className={`min-h-11 rounded-xl border px-2.5 py-2 text-xs font-black transition active:scale-95 ${
                  templateId === template.id
                    ? template.tone
                    : 'border-outline-variant/20 bg-surface-container-lowest text-on-surface-variant hover:border-primary/20'
                }`}
              >
                {template.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black tracking-widest text-on-surface-variant">
            <MessageSquareText size={12} />
            廣播內容
            <span className="ml-auto tracking-normal text-on-surface-variant/60">{finalMessage.length}/120</span>
          </div>
          <textarea
            value={customMessage}
            onChange={(event) => setCustomMessage(event.target.value.slice(0, 120))}
            placeholder={activeTemplate.message}
            className="min-h-24 w-full resize-none rounded-xl border border-outline-variant/25 bg-surface-container-lowest px-3 py-3 text-sm font-bold leading-relaxed text-on-surface outline-none transition focus:border-primary/35 focus:ring-2 focus:ring-primary/10"
          />
          <div className="mt-2 rounded-xl border border-primary/15 bg-white px-3 py-3">
            <p className="text-[9px] font-black tracking-[0.22em] text-primary">即將送出</p>
            <p className="mt-1 text-xs font-bold leading-relaxed text-on-surface">{zonesText}：{finalMessage}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2">
            <p className="text-[9px] font-black tracking-widest text-on-surface-variant">節點</p>
            <p className="mt-0.5 text-sm font-black text-primary">{nodeCount} 個</p>
          </div>
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2">
            <p className="text-[9px] font-black tracking-widest text-on-surface-variant">派工</p>
            <p className="mt-0.5 text-sm font-black text-primary">R-01</p>
          </div>
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2">
            <p className="text-[9px] font-black tracking-widest text-on-surface-variant">紀錄</p>
            <p className="mt-0.5 text-sm font-black text-primary">已同步</p>
          </div>
        </div>

        {lastSent && (
          <div className="rounded-xl border border-[#87d46c]/30 bg-[#87d46c]/10 px-3 py-3">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#4a9d35]">
              <Clock3 size={12} />
              最近廣播 · {lastSent.simulated ? '離線指令' : '真機送出'}
            </div>
            <p className="mt-1 text-xs font-bold leading-relaxed text-on-surface">
              {lastSent.template} / {lastSent.zones}：{lastSent.message}
            </p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {sent ? (
            <motion.div
              key="sent"
              initial={{opacity: 0, y: 4}}
              animate={{opacity: 1, y: 0}}
              exit={{opacity: 0}}
              className="flex min-h-13 items-center justify-center gap-2 rounded-2xl border-2 border-[#87d46c]/40 bg-[#87d46c]/15 text-sm font-black text-[#4a9d35]"
            >
              <CheckCircle2 size={18} />
              廣播已寫入任務紀錄
            </motion.div>
          ) : (
            <motion.button
              key="send"
              type="button"
              onClick={() => void sendBroadcast()}
              disabled={sending}
              whileTap={{scale: 0.97}}
              className={`flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl border-2 text-sm font-black transition disabled:cursor-wait disabled:opacity-70 ${
                confirming
                  ? 'border-error bg-error text-white shadow-lg shadow-error/35'
                  : activeTemplate.id === 'emergency'
                    ? 'border-error/30 bg-error/10 text-error hover:bg-error/15'
                    : 'border-primary/25 bg-primary text-white shadow-lg shadow-primary/20 hover:brightness-105'
              }`}
            >
              {activeTemplate.id === 'emergency' ? <ShieldAlert size={18} /> : <Megaphone size={18} />}
              {sending ? '送出中' : confirming ? '再按一次確認安全警示' : '發送廣播任務'}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
