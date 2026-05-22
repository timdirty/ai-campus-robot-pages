import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

function useIsTablet() {
  const [isTablet, setIsTablet] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsTablet(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isTablet;
}

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  fullScreen?: boolean;
}

export function BottomSheet({ isOpen, onClose, title, children, fullScreen = false }: BottomSheetProps) {
  const isTablet = useIsTablet();

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const motionProps = fullScreen
    ? { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.95 } }
    : isTablet
      ? { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } }
      : { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } };

  const panelClass = fullScreen
    ? 'inset-3 rounded-3xl sm:inset-4 sm:rounded-4xl w-auto max-w-none mx-0'
    : isTablet
      ? 'top-0 right-0 bottom-0 h-full w-[min(480px,60vw)]  rounded-l-2xl'
      : 'bottom-0 left-0 right-0 max-h-[92vh] rounded-t-[1.75rem] pb-safe sm:rounded-t-[2.5rem] w-full max-w-[min(42rem,calc(100vw-1rem))] mx-auto';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-100"
          />
          <motion.div
            {...motionProps}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? '彈出面板'}
            className={`fixed ${panelClass} bg-surface-container-lowest z-101 overflow-hidden flex flex-col shadow-2xl`}
          >
            {title && (
              <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/20 shrink-0 bg-surface-container-lowest relative">
                {!fullScreen && !isTablet && <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-outline-variant/30"></div>}
                <h3 className="font-headline font-bold text-2xl tracking-wide">{title}</h3>
                <button
                  onClick={onClose}
                  aria-label="關閉面板"
                  className="p-2 w-10 h-10 rounded-full bg-surface-container-high hover:bg-surface-container-highest transition-colors flex items-center justify-center text-on-surface active:scale-90"
                >
                  <X size={22} />
                </button>
              </div>
            )}
            <div className="overflow-y-auto flex-1 relative">
              {!title && fullScreen && (
                <button
                  onClick={onClose}
                  aria-label="關閉全螢幕面板"
                  className="absolute top-4 right-4 z-10 p-2 w-9 h-9 rounded-full bg-black/50 text-white backdrop-blur-md transition-colors flex items-center justify-center active:scale-90"
                >
                  <X size={20} />
                </button>
              )}
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
