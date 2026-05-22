import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  appReducer,
  AppAction,
  AppState,
  createDeliveryOrder,
  loadPersistedState,
  normalizePersistedState,
  persistState,
  resetDemoState,
  saveSchedule,
  completeOrder,
  addTeachingSignal,
  clearTeachingSignals,
  resolveTeachingSignal,
  DispatchTaskType,
  RobotStatus,
  SensorsState,
} from './appState';
import {sendHardwareCommand} from '../services/hardwareBridge';

interface AppActions {
  dispatch: React.Dispatch<AppAction>;
  createDeliveryOrder: (payload: { productId: number; quantity: number; destination: string }) => void;
  completeOrder: (orderId: string) => void;
  autoCompleteInTransit: () => void;
  saveSchedule: (payload: { id: string; time: string; area: string }) => void;
  scanAttendance: () => void;
  recordTeachingScanTask: (payload?: { id?: string; title?: string; detail?: string }) => void;
  completeTeachingScanTask: (payload: { id: string; detail?: string }) => void;
  addTeachingSignal: (payload: { id?: string; type: 'question' | 'alert'; name: string; studentId: string; message: string; visual?: AppState['teachingSignals'][number]['visual'] }) => void;
  clearTeachingSignals: () => void;
  resolveTeachingSignal: (payload: { signalId: string; action: string }) => void;
  addTeacherReply: (payload: { signalId: string; reply: string }) => void;
  setEmergency: (enabled: boolean) => void;
  setNotifications: (enabled: boolean) => void;
  setRemindWarning: (enabled: boolean) => void;
  setExpectedAttendanceTotal: (total: number) => void;
  setDemoMode: (enabled: boolean) => void;
  setRobotMode: (payload: {robotId: string; status: RobotStatus}) => void;
  addDispatchTask: (payload: { zone: string; taskType: DispatchTaskType; message?: string }) => void;
  completeDispatchTask: (payload: { zone: string; taskType: DispatchTaskType }) => void;
  setRobotRunning: (robotId: string, running: boolean) => void;
  setRobotSpeed: (robotId: string, speed: number) => void;
  tickSensors: (sensors: SensorsState) => void;
  clearLocalCache: () => void;
  restoreDemo: (input: unknown) => void;
  resetDemo: () => void;
}

const AppStateContext = createContext<AppState | null>(null);
const AppActionsContext = createContext<AppActions | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, loadPersistedState);
  const sentCommandIds = useRef(new Set<string>());
  const hardwareBridgeReady = useRef(false);

  useEffect(() => {
    persistState(state);
  }, [state]);

  useEffect(() => {
    const command = state.robotCommandLogs[0];
    if (!hardwareBridgeReady.current) {
      hardwareBridgeReady.current = true;
      if (command) sentCommandIds.current.add(command.id);
      return;
    }
    if (!command || command.command === 'SYSTEM_READY' || sentCommandIds.current.has(command.id)) return;
    if (command.status === 'sent' || command.status === 'failed') return;

    sentCommandIds.current.add(command.id);
    if (sentCommandIds.current.size > 100) {
      const [oldest] = sentCommandIds.current;
      sentCommandIds.current.delete(oldest);
    }
    void sendHardwareCommand(command.command, `app2:${command.source}`).then((result) => {
      dispatch({
        type: 'MARK_HARDWARE_COMMAND',
        payload: {id: command.id, ok: result.ok, message: result.message, simulated: result.simulated},
      });
    }).catch(() => {
      dispatch({type: 'MARK_HARDWARE_COMMAND', payload: {id: command.id, ok: false, message: '指令發送失敗'}});
    });
  }, [state.robotCommandLogs]);

  const actions = useMemo<AppActions>(
    () => ({
      dispatch,
      createDeliveryOrder: (payload) => dispatch(createDeliveryOrder(payload)),
      completeOrder: (orderId) => dispatch(completeOrder(orderId)),
      autoCompleteInTransit: () => dispatch({ type: 'AUTO_COMPLETE_IN_TRANSIT' }),
      saveSchedule: (payload) => dispatch(saveSchedule(payload)),
      scanAttendance: () => dispatch({ type: 'SET_ATTENDANCE_SCANNED' }),
      recordTeachingScanTask: (payload) => dispatch({ type: 'RECORD_TEACHING_SCAN_TASK', payload }),
      completeTeachingScanTask: (payload) => dispatch({ type: 'COMPLETE_TEACHING_SCAN_TASK', payload }),
      addTeachingSignal: (payload) => dispatch(addTeachingSignal(payload)),
      clearTeachingSignals: () => dispatch(clearTeachingSignals()),
      resolveTeachingSignal: (payload) => dispatch(resolveTeachingSignal(payload)),
      addTeacherReply: (payload) => dispatch({ type: 'ADD_TEACHER_REPLY', payload }),
      setEmergency: (enabled) => dispatch({ type: 'SET_EMERGENCY', payload: { enabled } }),
      setNotifications: (enabled) => dispatch({ type: 'SET_NOTIFICATIONS', payload: { enabled } }),
      setRemindWarning: (enabled) => dispatch({ type: 'SET_REMIND_WARNING', payload: { enabled } }),
      setExpectedAttendanceTotal: (total) => dispatch({ type: 'SET_EXPECTED_ATTENDANCE_TOTAL', payload: { total } }),
      setDemoMode: (enabled) => dispatch({ type: 'SET_DEMO_MODE', payload: { enabled } }),
      setRobotMode: (payload) => dispatch({ type: 'SET_ROBOT_MODE', payload }),
      addDispatchTask: (payload) => dispatch({ type: 'ADD_DISPATCH_TASK', payload }),
      completeDispatchTask: (payload) => dispatch({ type: 'COMPLETE_DISPATCH_TASK', payload }),
      setRobotRunning: (robotId, running) =>
        dispatch({ type: 'SET_ROBOT_RUNNING', payload: { robotId, running } }),
      setRobotSpeed: (robotId, speed) => dispatch({ type: 'SET_ROBOT_SPEED', payload: { robotId, speed } }),
      tickSensors: (sensors) => dispatch({ type: 'TICK_SENSORS', payload: sensors }),
      clearLocalCache: () => dispatch({ type: 'CLEAR_LOCAL_CACHE' }),
      restoreDemo: (input) => dispatch({ type: 'RESTORE_DEMO_STATE', payload: { state: normalizePersistedState(input) } }),
      resetDemo: () => dispatch(resetDemoState()),
    }),
    [],
  );

  return (
    <AppStateContext.Provider value={state}>
      <AppActionsContext.Provider value={actions}>{children}</AppActionsContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const state = useContext(AppStateContext);
  if (!state) throw new Error('useAppState must be used inside AppStateProvider');
  return state;
}

export function useAppActions() {
  const actions = useContext(AppActionsContext);
  if (!actions) throw new Error('useAppActions must be used inside AppStateProvider');
  return actions;
}
