import { AnimatePresence, motion } from 'motion/react';
import { useLayoutEffect, useState } from 'react';
import { TOUR_STEPS } from './tourSteps';
import { useTour } from './useTour';

const BACKDROP_COLOR = 'rgba(0,0,0,0.55)';
const FULLSCREEN_BACKDROP_COLOR = 'rgba(0,0,0,0.7)';
const TOOLTIP_Z = 9999;
const OVERLAY_Z = 9998;
const SKIP_Z = 10000;
const TOOLTIP_W = 320;
const TOOLTIP_ESTIMATED_H = 220;
const GAP = 12;

const primaryBtn: React.CSSProperties = {
  backgroundColor: '#0d9488',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '8px 18px',
  minHeight: 44,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};

const secondaryBtn: React.CSSProperties = {
  backgroundColor: '#f1f5f9',
  color: '#334155',
  border: 'none',
  borderRadius: 8,
  padding: '8px 18px',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};

const operationNoteBox: React.CSSProperties = {
  backgroundColor: '#f0fdfa',
  border: '1px solid #99f6e4',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  color: '#0f766e',
  marginTop: 10,
  lineHeight: 1.5,
};

const operationNoteLabel: React.CSSProperties = {
  display: 'block',
  marginBottom: 4,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.08em',
  color: '#0f766e',
};

const skipBtnStyle: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  right: 16,
  zIndex: SKIP_Z,
  color: '#94a3b8',
  cursor: 'pointer',
  fontSize: 13,
  background: 'none',
  border: 'none',
  padding: '10px 16px',
  minHeight: 44,
  minWidth: 44,
};

const fullscreenOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: FULLSCREEN_BACKDROP_COLOR,
  zIndex: OVERLAY_Z,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const modalCard: React.CSSProperties = {
  background: 'white',
  borderRadius: 16,
  padding: 28,
  maxWidth: 400,
  width: '90%',
  boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
};

const cardTitle: React.CSSProperties = {margin: '0 0 12px', fontSize: 22, fontWeight: 700, color: '#0f172a'};
const cardBody: React.CSSProperties = {margin: '0 0 4px', fontSize: 15, color: '#334155', lineHeight: 1.6};
const cardFooter: React.CSSProperties = {marginTop: 20, display: 'flex', justifyContent: 'flex-end'};

type Rect = { top: number; left: number; bottom: number; right: number; width: number; height: number };

function emptyRect(): Rect {
  return { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };
}

function FullscreenCard({
  stepIndex,
  title,
  body,
  demoTip,
  isFirst,
  isLast,
  onNext,
  onSkip,
}: {
  stepIndex: number;
  title: string;
  body: string;
  demoTip: string;
  isFirst: boolean;
  isLast: boolean;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div style={fullscreenOverlay}>
      <button style={skipBtnStyle} onClick={onSkip}>
        關閉提示
      </button>

      <AnimatePresence mode="wait">
        <motion.div
          key={stepIndex}
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={modalCard}
        >
          <h2 style={cardTitle}>{title}</h2>
          <p style={cardBody}>{body}</p>
          <div style={operationNoteBox}>
            <span style={operationNoteLabel}>操作重點</span>
            {demoTip}
          </div>
          <div style={cardFooter}>
            {isFirst && !isLast && (
              <button style={primaryBtn} onClick={onNext}>
                開始查看 →
              </button>
            )}
            {isLast && (
              <button style={primaryBtn} onClick={onNext}>
                開始使用 ✓
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function SpotlightOverlay({
  rect,
  stepIndex,
  title,
  body,
  demoTip,
  tooltipSide,
  isFirstSpotlight,
  totalSpotlightSteps,
  spotlightIndex,
  onNext,
  onPrev,
  onSkip,
}: {
  rect: Rect;
  stepIndex: number;
  title: string;
  body: string;
  demoTip: string;
  tooltipSide: 'top' | 'bottom' | 'left' | 'right';
  isFirstSpotlight: boolean;
  totalSpotlightSteps: number;
  spotlightIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [vw, setVw] = useState(window.innerWidth);
  const [vh, setVh] = useState(window.innerHeight);

  useLayoutEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, [stepIndex]);

  useLayoutEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  let tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: TOOLTIP_Z,
    width: TOOLTIP_W,
    maxWidth: TOOLTIP_W,
    background: 'white',
    borderRadius: 12,
    boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
    padding: 16,
    opacity: visible ? 1 : 0,
    transition: 'opacity 0.1s ease',
  };

  const targetCenterX = rect.left + rect.width / 2;
  const clampedLeft = Math.min(Math.max(8, targetCenterX - TOOLTIP_W / 2), vw - TOOLTIP_W - 8);

  if (tooltipSide === 'bottom') {
    tooltipStyle = { ...tooltipStyle, top: Math.min(rect.bottom + GAP, vh - TOOLTIP_ESTIMATED_H), left: clampedLeft };
  } else if (tooltipSide === 'top') {
    tooltipStyle = { ...tooltipStyle, top: Math.max(8, rect.top - TOOLTIP_ESTIMATED_H - GAP), left: clampedLeft };
  } else if (tooltipSide === 'left') {
    tooltipStyle = {
      ...tooltipStyle,
      top: Math.max(8, Math.min(rect.top + rect.height / 2 - TOOLTIP_ESTIMATED_H / 2, vh - TOOLTIP_ESTIMATED_H - 8)),
      left: Math.max(8, rect.left - TOOLTIP_W - GAP),
    };
  } else {
    tooltipStyle = {
      ...tooltipStyle,
      top: Math.max(8, Math.min(rect.top + rect.height / 2 - TOOLTIP_ESTIMATED_H / 2, vh - TOOLTIP_ESTIMATED_H - 8)),
      left: Math.min(rect.right + GAP, vw - TOOLTIP_W - 8),
    };
  }

  const divTransition = 'top 150ms ease, left 150ms ease, width 150ms ease, height 150ms ease';

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, width: vw, height: Math.max(0, rect.top), backgroundColor: BACKDROP_COLOR, zIndex: OVERLAY_Z, transition: divTransition, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', top: rect.bottom, left: 0, width: vw, height: Math.max(0, vh - rect.bottom), backgroundColor: BACKDROP_COLOR, zIndex: OVERLAY_Z, transition: divTransition, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', top: rect.top, left: 0, width: Math.max(0, rect.left), height: Math.max(0, rect.height), backgroundColor: BACKDROP_COLOR, zIndex: OVERLAY_Z, transition: divTransition, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', top: rect.top, left: rect.right, width: Math.max(0, vw - rect.right), height: Math.max(0, rect.height), backgroundColor: BACKDROP_COLOR, zIndex: OVERLAY_Z, transition: divTransition, pointerEvents: 'none' }} />

      <div style={tooltipStyle}>
        <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{title}</p>
        <p style={{ margin: '0', fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{body}</p>
        <div style={operationNoteBox}>
          <span style={operationNoteLabel}>操作重點</span>
          {demoTip}
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>步驟 {spotlightIndex} / {totalSpotlightSteps}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isFirstSpotlight && (
              <button style={secondaryBtn} onClick={onPrev}>← 上一步</button>
            )}
            <button style={primaryBtn} onClick={onNext}>下一步 →</button>
          </div>
        </div>
      </div>

        <button style={skipBtnStyle} onClick={onSkip}>關閉提示</button>
    </>
  );
}

export function TourOverlay() {
  const { isActive, currentStepIndex, nextStep, prevStep, skipTour } = useTour();
  const [rect, setRect] = useState<Rect>(emptyRect());

  const step = TOUR_STEPS[currentStepIndex];

  useLayoutEffect(() => {
    if (!isActive || !step || step.isFullscreen || !step.targetDataTour) return;

    const updateRect = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.targetDataTour}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height });
    };

    updateRect();

    const el = document.querySelector<HTMLElement>(`[data-tour="${step.targetDataTour}"]`);
    let ro: ResizeObserver | null = null;
    if (el) {
      ro = new ResizeObserver(updateRect);
      ro.observe(el);
    }

    window.addEventListener('scroll', updateRect, { passive: true });
    window.addEventListener('resize', updateRect, { passive: true });

    return () => {
      ro?.disconnect();
      window.removeEventListener('scroll', updateRect);
      window.removeEventListener('resize', updateRect);
    };
  }, [isActive, step]);

  if (!isActive || !step) return null;

  const spotlightSteps = TOUR_STEPS.filter((s) => !s.isFullscreen);
  const totalSpotlightSteps = spotlightSteps.length;
  const spotlightIndex = spotlightSteps.indexOf(step) + 1;

  if (step.isFullscreen) {
    const isFirst = currentStepIndex === 0;
    const isLast = currentStepIndex === TOUR_STEPS.length - 1;
    return (
      <FullscreenCard
        stepIndex={currentStepIndex}
        title={step.title}
        body={step.body}
        demoTip={step.demoTip}
        isFirst={isFirst}
        isLast={isLast}
        onNext={nextStep}
        onSkip={skipTour}
      />
    );
  }

  const targetEl = document.querySelector<HTMLElement>(`[data-tour="${step.targetDataTour}"]`);
  if (!targetEl) {
    return (
      <>
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: FULLSCREEN_BACKDROP_COLOR,
            zIndex: OVERLAY_Z,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ color: 'white', fontSize: 16 }}>載入中…</div>
        </div>
        <button style={skipBtnStyle} onClick={skipTour}>關閉提示</button>
      </>
    );
  }

  const isFirstSpotlight = currentStepIndex === 1;

  return (
    <SpotlightOverlay
      rect={rect}
      stepIndex={currentStepIndex}
      title={step.title}
      body={step.body}
      demoTip={step.demoTip}
      tooltipSide={step.tooltipSide ?? 'bottom'}
      isFirstSpotlight={isFirstSpotlight}
      totalSpotlightSteps={totalSpotlightSteps}
      spotlightIndex={spotlightIndex}
      onNext={nextStep}
      onPrev={prevStep}
      onSkip={skipTour}
    />
  );
}
