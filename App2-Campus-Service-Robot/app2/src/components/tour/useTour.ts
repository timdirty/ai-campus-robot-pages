import { useContext } from 'react';
import { TourContext, type TourContextValue } from './TourProvider';

export function useTour(): TourContextValue {
  return useContext(TourContext);
}
