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

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
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
    currentStepIndexRef.current = next;
    setCurrentStepIndex(next);
  }, [completeTour]);

  const prevStep = useCallback(() => {
    const next = Math.max(0, currentStepIndexRef.current - 1);
    currentStepIndexRef.current = next;
    setCurrentStepIndex(next);
  }, []);

  const skipTour = useCallback(() => {
    completeTour();
  }, [completeTour]);

  const restartTour = useCallback(() => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    currentStepIndexRef.current = 0;
    setCurrentStepIndex(0);
    setIsActive(true);
  }, []);

  useEffect(() => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'done');
  }, []);

  return (
    <TourContext.Provider
      value={{ isActive, currentStepIndex, totalSteps: TOUR_STEPS.length, startTour, nextStep, prevStep, skipTour, restartTour }}
    >
      {children}
    </TourContext.Provider>
  );
}
