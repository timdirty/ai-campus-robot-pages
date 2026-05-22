import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { TOUR_STEPS, TOUR_STORAGE_KEY } from './tourSteps';

export type TourContextValue = {
  isActive: boolean;
  currentStepIndex: number;
  totalSteps: number;
  startTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  restartTour: () => void;
};

export const TourContext = createContext<TourContextValue>({
  isActive: false,
  currentStepIndex: 0,
  totalSteps: TOUR_STEPS.length,
  startTour: () => {},
  nextStep: () => {},
  prevStep: () => {},
  skipTour: () => {},
  restartTour: () => {},
});

export function TourProvider({
  children,
  onTabChange,
}: {
  children: React.ReactNode;
  onTabChange: (tab: string) => void;
}) {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const onTabChangeRef = useRef(onTabChange);
  onTabChangeRef.current = onTabChange;
  const currentStepIndexRef = useRef(0);

  const completeTour = useCallback(() => {
    setIsActive(false);
    localStorage.setItem(TOUR_STORAGE_KEY, 'done');
  }, []);

  const startTour = useCallback(() => {
    currentStepIndexRef.current = 0;
    setCurrentStepIndex(0);
    setIsActive(true);
  }, []);

  const nextStep = useCallback(() => {
    const next = currentStepIndexRef.current + 1;
    if (next >= TOUR_STEPS.length) {
      completeTour();
      return;
    }
    const nextStepData = TOUR_STEPS[next];
    if (nextStepData?.tab) {
      onTabChangeRef.current(nextStepData.tab);
    }
    currentStepIndexRef.current = next;
    setCurrentStepIndex(next);
  }, [completeTour]);

  const prevStep = useCallback(() => {
    const next = Math.max(0, currentStepIndexRef.current - 1);
    const prevStepData = TOUR_STEPS[next];
    if (prevStepData?.tab) {
      onTabChangeRef.current(prevStepData.tab);
    }
    currentStepIndexRef.current = next;
    setCurrentStepIndex(next);
  }, []);

  const skipTour = useCallback(() => {
    completeTour();
  }, [completeTour]);

  const restartTour = useCallback(() => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    onTabChangeRef.current('delivery');
    currentStepIndexRef.current = 0;
    setCurrentStepIndex(0);
    setIsActive(true);
  }, []);

  // Competition mode: keep the first screen clean. The tour is available from settings,
  // and can also be opened explicitly with ?tour=1 for rehearsal.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tour') === '1') {
      localStorage.removeItem(TOUR_STORAGE_KEY);
      const timer = setTimeout(() => startTour(), 600);
      return () => clearTimeout(timer);
    }
  }, [startTour]);

  return (
    <TourContext.Provider
      value={{ isActive, currentStepIndex, totalSteps: TOUR_STEPS.length, startTour, nextStep, prevStep, skipTour, restartTour }}
    >
      {children}
    </TourContext.Provider>
  );
}
