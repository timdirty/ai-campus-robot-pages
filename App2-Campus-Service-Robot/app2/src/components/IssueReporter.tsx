import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, CheckCircle2, Circle, Image as ImageIcon, List, MessageSquarePlus, Send, Trash2, X } from 'lucide-react';

type IssueType = 'bug' | 'suggest' | 'ui' | 'other';
type IssueStatus = 'open' | 'resolved';
type FilterTab = 'all' | 'open' | 'resolved';

type Issue = {
  id: string;
  type: IssueType;
  text: string;
  imageDataUrl?: string;
  createdAt: number;
  status: IssueStatus;
};

const TYPE_OPTIONS: { value: IssueType; label: string; emoji: string }[] = [
  { value: 'bug',     label: '錯誤',  emoji: '🐛' },
  { value: 'suggest', label: '建議',  emoji: '💡' },
  { value: 'ui',      label: '介面',  emoji: '🎨' },
  { value: 'other',   label: '其他',  emoji: '❓' },
];

function loadIssues(key: string): Issue[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; }
}
function saveIssues(key: string, issues: Issue[]) {
  try { localStorage.setItem(key, JSON.stringify(issues)); } catch {}
}
function fmt(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function IssueReporter({
  storageKey,
  accentColor = '#6366f1',
}: {
  storageKey: string;
  accentColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'form' | 'list'>('form');
  const [type, setType] = useState<IssueType>('bug');
  const [text, setText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>();
  const [issues, setIssues] = useState<Issue[]>(() => loadIssues(storageKey));
  const [submitted, setSubmitted] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('all');
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const openCount = issues.filter(i => i.status === 'open').length;

  // paste image anywhere in panel
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setImageDataUrl(reader.result as string);
      reader.readAsDataURL(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) { alert('圖片請選 1.5MB 以內'); return; }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearImage = () => { setImageDataUrl(undefined); if (fileRef.current) fileRef.current.value = ''; };

  const update = (next: Issue[]) => { setIssues(next); saveIssues(storageKey, next); };

  const handleSubmit = () => {
    if (!text.trim()) return;
    update([{ id: Date.now().toString(), type, text: text.trim(), imageDataUrl, createdAt: Date.now(), status: 'open' }, ...issues]);
    setText('');
    clearImage();
    setType('bug');
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
  };

  const toggleStatus = (id: string) =>
    update(issues.map(i => i.id === id ? { ...i, status: i.status === 'open' ? 'resolved' : 'open' } : i));

  const handleDelete = (id: string) => update(issues.filter(i => i.id !== id));

  const filtered = filter === 'all' ? issues : issues.filter(i => i.status === filter);

  const toggle = () => { setOpen(o => !o); setView('form'); };

  return (
    <>
      {/* FAB */}
      <div style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 9000 }}>
        {openCount > 0 && !open && (
          <motion.div
            animate={{ scale: [1, 1.35, 1] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
            style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: accentColor, opacity: 0.25 }}
          />
        )}
        <button
          onClick={toggle}
          title="回報問題"
          style={{
            position: 'relative', width: 48, height: 48, borderRadius: '50%',
            backgroundColor: accentColor, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.28)', color: 'white',
          }}
        >
          <AnimatePresence mode="wait">
            <motion.span key={open ? 'x' : 'msg'} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.15 }} style={{ display: 'flex' }}>
              {open ? <X size={22} /> : <MessageSquarePlus size={22} />}
            </motion.span>
          </AnimatePresence>
          {!open && openCount > 0 && (
            <span style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#ef4444', color: 'white', fontSize: 11, fontWeight: 700, borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {openCount > 9 ? '9+' : openCount}
            </span>
          )}
        </button>
      </div>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: 'fixed', bottom: 76, left: 20, zIndex: 9000, width: 330, maxHeight: '72vh', backgroundColor: 'white', borderRadius: 18, boxShadow: '0 12px 48px rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            {/* header */}
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {view === 'list' && (
                  <button onClick={() => setView('form')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', padding: 2 }}>
                    <ChevronLeft size={18} />
                  </button>
                )}
                <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
                  {view === 'form' ? '回報問題' : `問題清單`}
                </span>
                {view === 'list' && openCount > 0 && (
                  <span style={{ backgroundColor: '#fef2f2', color: '#ef4444', fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '2px 7px' }}>
                    {openCount} 待處理
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {view === 'form' && issues.length > 0 && (
                  <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <List size={15} /> 清單
                  </button>
                )}
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {view === 'form' ? (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
                {/* type selector */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {TYPE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setType(opt.value)}
                      style={{
                        flex: 1, padding: '6px 4px', border: `1.5px solid ${type === opt.value ? accentColor : '#e2e8f0'}`,
                        borderRadius: 8, cursor: 'pointer', background: type === opt.value ? accentColor + '14' : 'transparent',
                        fontSize: 11, fontWeight: 600, color: type === opt.value ? accentColor : '#64748b',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, transition: 'all 0.12s',
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{opt.emoji}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="描述你發現的問題或想改進的地方…"
                  rows={4}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: '#1e293b', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                />

                {imageDataUrl ? (
                  <div style={{ position: 'relative' }}>
                    <img src={imageDataUrl} alt="附圖" style={{ width: '100%', borderRadius: 8, objectFit: 'cover', maxHeight: 140 }} />
                    <button onClick={clearImage} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 13, background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
                    <ImageIcon size={15} /> 附上截圖（選填，可直接貼上）
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />

                <button
                  onClick={handleSubmit}
                  disabled={!text.trim()}
                  style={{ backgroundColor: text.trim() ? accentColor : '#e2e8f0', color: text.trim() ? 'white' : '#94a3b8', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: text.trim() ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  {submitted ? '✓ 已送出！' : <><Send size={14} /> 送出回報</>}
                </button>

                {issues.length > 0 && (
                  <button onClick={() => setView('list')} style={{ color: '#64748b', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'center' }}>
                    查看所有 {issues.length} 筆回報（{openCount} 待處理）→
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                {/* filter tabs */}
                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                  {(['all', 'open', 'resolved'] as FilterTab[]).map(tab => {
                    const labels = { all: `全部 ${issues.length}`, open: `待處理 ${issues.filter(i => i.status === 'open').length}`, resolved: `已處理 ${issues.filter(i => i.status === 'resolved').length}` };
                    return (
                      <button key={tab} onClick={() => setFilter(tab)} style={{ flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', color: filter === tab ? accentColor : '#94a3b8', borderBottom: filter === tab ? `2px solid ${accentColor}` : '2px solid transparent', transition: 'all 0.12s' }}>
                        {labels[tab]}
                      </button>
                    );
                  })}
                </div>

                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {filtered.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
                      {filter === 'open' ? '沒有待處理的回報' : '還沒有回報'}
                    </div>
                  ) : filtered.map(issue => {
                    const typeInfo = TYPE_OPTIONS.find(t => t.value === issue.type)!;
                    return (
                      <div key={issue.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f8fafc', opacity: issue.status === 'resolved' ? 0.65 : 1, transition: 'opacity 0.2s' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <button onClick={() => toggleStatus(issue.id)} title={issue.status === 'open' ? '標記為已處理' : '標記為待處理'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, color: issue.status === 'resolved' ? '#22c55e' : '#cbd5e1', marginTop: 1 }}>
                            {issue.status === 'resolved' ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 12, backgroundColor: '#f1f5f9', borderRadius: 6, padding: '1px 6px', color: '#475569', fontWeight: 600 }}>{typeInfo.emoji} {typeInfo.label}</span>
                              {issue.status === 'resolved' && <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>已處理</span>}
                            </div>
                            <p style={{ margin: 0, fontSize: 13, color: '#1e293b', lineHeight: 1.5, wordBreak: 'break-word', textDecoration: issue.status === 'resolved' ? 'line-through' : 'none' }}>{issue.text}</p>
                            {issue.imageDataUrl && (
                              <img src={issue.imageDataUrl} alt="" style={{ width: '100%', borderRadius: 6, marginTop: 8, objectFit: 'cover', maxHeight: 100 }} />
                            )}
                            <p style={{ margin: '5px 0 0', fontSize: 11, color: '#94a3b8' }}>{fmt(issue.createdAt)}</p>
                          </div>
                          <button onClick={() => handleDelete(issue.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e2e8f0', padding: 2, flexShrink: 0 }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
