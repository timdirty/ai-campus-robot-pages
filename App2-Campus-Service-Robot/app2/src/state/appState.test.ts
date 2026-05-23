import assert from 'node:assert/strict';
import {
  appReducer,
  createDemoAppState,
  createInitialAppState,
  createDeliveryOrder,
  completeOrder,
  saveSchedule,
  resolveTeachingSignal,
  resetDemoState,
  normalizePersistedState,
  loadPersistedState,
} from './appState';
import {
  generateClassSummary,
  generateDispatchRecommendation,
  generateStudentInsights,
  generateTeacherReply,
} from '../services/localAi';
import { createPrintableReportHtml } from '../services/reports';

async function run() {
  const emptyInitial = createInitialAppState();
  assert.equal(emptyInitial.settings.demoMode, true);
  assert.ok(emptyInitial.orders.length > 0);
  assert.ok(emptyInitial.tasks.length > 0);
  assert.ok(emptyInitial.robotCommandLogs.length > 0);

  const initial = createDemoAppState();
  const product = initial.products.find((item) => item.stock > 1);
  assert.ok(product, 'fixture should include an orderable product');

  const ordered = appReducer(
    initial,
    createDeliveryOrder({
      productId: product.id,
      quantity: 2,
      destination: '507 教室',
    }),
  );
  const updatedProduct = ordered.products.find((item) => item.id === product.id);
  assert.equal(updatedProduct?.stock, product.stock - 2);
  assert.equal(ordered.orders[0]?.status, 'in_transit');
  assert.equal(ordered.tasks[0]?.source, 'delivery');
  assert.equal(ordered.robots.find((robot) => robot.id === '1號')?.status, '配送');
  assert.equal(ordered.robotCommandLogs[0]?.command, 'DELIVERY_START');
  assert.equal(ordered.robotCommandLogs[0]?.status, 'queued');

  const rejected = appReducer(
    initial,
    createDeliveryOrder({
      productId: product.id,
      quantity: product.stock + 100,
      destination: '507 教室',
    }),
  );
  assert.equal(rejected.orders.length, initial.orders.length);
  assert.equal(rejected.robotCommandLogs[0]?.command, 'SYSTEM_READY');
  assert.equal(rejected.logs[0].message.includes('硬體未派遣'), true);

  const delivered = appReducer(ordered, completeOrder(ordered.orders[0].id));
  assert.equal(delivered.orders[0]?.status, 'delivered');
  assert.equal(delivered.robots.find((robot) => robot.id === '1號')?.status, '待命');
  assert.equal(delivered.robotCommandLogs[0]?.command, 'DELIVERY_DONE');

  const scheduled = appReducer(
    delivered,
    saveSchedule({
      id: delivered.schedules[0].id,
      time: '17:10',
      area: 'B 棟活動中心與操場',
    }),
  );
  assert.equal(scheduled.schedules[0].time, '17:10');
  assert.equal(scheduled.logs[0].message.includes('排程'), true);
  assert.equal(scheduled.robotCommandLogs[0]?.command, 'CLEAN_SCHEDULE');

  const attendanceScanned = appReducer(scheduled, { type: 'SET_ATTENDANCE_SCANNED' });
  assert.equal(attendanceScanned.attendance.scanned, true);
  assert.equal(attendanceScanned.robotCommandLogs[0]?.command, 'TEACH_SCAN');

  const alert = attendanceScanned.teachingSignals.find((signal) => signal.type === 'alert');
  assert.ok(alert, 'fixture should include an alert signal');
  const resolved = appReducer(
    attendanceScanned,
    resolveTeachingSignal({
      signalId: alert.id,
      action: '已發送硬體震動提醒',
    }),
  );
  assert.equal(resolved.teachingSignals.some((signal) => signal.id === alert.id), false);
  assert.equal(
    resolved.studentReports[alert.studentId].events.some((event) =>
      event.includes('已發送硬體震動提醒'),
    ),
    true,
  );
  assert.equal(resolved.robotCommandLogs[0]?.command, 'FOCUS_NUDGE');

  const dispatched = appReducer(resolved, {
    type: 'ADD_DISPATCH_TASK',
    payload: { zone: 'B', taskType: 'broadcast' },
  });
  assert.equal(dispatched.campusStatus.activeZone, 'B');
  assert.equal(dispatched.robotCommandLogs[0]?.command, 'BROADCAST_START');
  const completedDispatch = appReducer(dispatched, {
    type: 'COMPLETE_DISPATCH_TASK',
    payload: { zone: 'B', taskType: 'broadcast' },
  });
  assert.equal(completedDispatch.tasks[0].status, 'completed');

  const scriptedBroadcast = appReducer(initial, {
    type: 'ADD_DISPATCH_TASK',
    payload: {zone: 'B 棟走廊', taskType: 'broadcast', message: '請同學靠右慢行，勿奔跑推擠。'},
  });
  assert.equal(scriptedBroadcast.tasks[0].area, 'B 棟走廊');
  assert.equal(scriptedBroadcast.tasks[0].detail?.includes('請同學靠右慢行'), true);
  assert.equal(scriptedBroadcast.robotCommandLogs[0].note.includes('請同學靠右慢行'), true);

  const phoneAlert = appReducer(initial, {
    type: 'ADD_TEACHING_SIGNAL',
    payload: {type: 'alert', name: '電子裝置', studentId: 'vision-device', message: '畫面疑似有學生使用手機或電子裝置，請老師確認。'},
  });
  const phoneAlertDuplicate = appReducer(phoneAlert, {
    type: 'ADD_TEACHING_SIGNAL',
    payload: {type: 'alert', name: '即時告警', studentId: 'vision-2', message: '偵測到疑似滑手機，請老師確認。'},
  });
  assert.equal(phoneAlertDuplicate.teachingSignals.length, phoneAlert.teachingSignals.length);

  const locked = appReducer(dispatched, { type: 'SET_EMERGENCY', payload: { enabled: true } });
  assert.equal(locked.campusStatus.safetyMode, 'lockdown');
  assert.equal(locked.robotCommandLogs[0]?.command, 'SAFETY_LOCKDOWN');

  const reset = appReducer(locked, resetDemoState());
  assert.equal(reset.orders.length, initial.orders.length);
  assert.equal(reset.products.find((item) => item.id === product.id)?.stock, product.stock);

  const demoOff = appReducer(initial, {type: 'SET_DEMO_MODE', payload: {enabled: false}});
  assert.equal(demoOff.settings.demoMode, false);
  assert.equal(demoOff.orders.length, 0);
  assert.equal(demoOff.products.length, 0);
  const demoOn = appReducer(demoOff, {type: 'SET_DEMO_MODE', payload: {enabled: true}});
  assert.equal(demoOn.settings.demoMode, true);
  assert.equal(demoOn.products.length, initial.products.length);

  const recovered = normalizePersistedState({
    robots: null,
    products: 'broken',
    robotCommandLogs: undefined,
    hardwareMode: 'unknown',
    logs: null,
  });
  assert.equal(recovered.robots.length, initial.robots.length);
  assert.equal(recovered.products.length, initial.products.length);
  assert.equal(recovered.hardwareMode, 'demo');
  assert.ok(recovered.robotCommandLogs.length >= 1);

  const partiallyRecovered = normalizePersistedState({
    settings: {demoMode: true},
    robots: [null, {id: '9號', status: '飛行', battery: 180, position: '臨時展示區'}],
    products: [null, {id: 99, name: '展示鉛筆', price: -4, category: 'unknown', stock: 3}],
    orders: [null, {id: 'order-live', productName: '展示鉛筆', quantity: 2, destination: '507 教室', status: 'in_transit'}],
    tasks: [null, {id: 'task-x', title: '臨時任務', status: 'stuck', source: 'unknown', area: ''}],
    attendance: {scanned: 'yes', present: 9999, absentNames: ['座號 12', 7]},
    sensors: {temp: 200, hum: -2, aqi: 'bad'},
    robotCommandLogs: [null, {id: 'cmd-x', command: 'DEMO', source: 'unknown', mode: 'bad', status: 'bad'}],
  });
  assert.equal(partiallyRecovered.robots.length, 1);
  assert.equal(partiallyRecovered.robots[0].id, '1號');
  assert.equal(partiallyRecovered.robots[0].serial, '校園服務機 R-01');
  assert.equal(partiallyRecovered.robots[0].status, '配送');
  assert.equal(partiallyRecovered.robots[0].battery, 100);
  assert.equal(partiallyRecovered.products[0].price, 0);
  assert.equal(partiallyRecovered.products[0].category, initial.products[1].category);
  assert.equal(partiallyRecovered.orders.length, 1);
  assert.equal(partiallyRecovered.orders[0].id, 'order-live');
  assert.equal(partiallyRecovered.orders[0].productName, '展示鉛筆');
  assert.equal(partiallyRecovered.orders[0].destination, '507 教室');
  assert.equal(partiallyRecovered.tasks[0].status, initial.tasks[0].status);
  assert.equal(partiallyRecovered.attendance.present, 999);
  assert.deepEqual(partiallyRecovered.attendance.absentNames, ['座號 12']);
  assert.equal(partiallyRecovered.sensors.temp, 80);
  assert.equal(partiallyRecovered.sensors.hum, 0);
  assert.equal(partiallyRecovered.robotCommandLogs[0].status, 'demo-only');

  const marked = appReducer(ordered, {
    type: 'MARK_HARDWARE_COMMAND',
    payload: {id: ordered.robotCommandLogs[0].id, ok: false, message: '未偵測到 Arduino 序列埠，已切換離線展示模式'},
  });
  assert.equal(marked.robotCommandLogs[0].status, 'failed');
  assert.equal(marked.logs[0].type, 'warn');

  const simulatedMarked = appReducer(ordered, {
    type: 'MARK_HARDWARE_COMMAND',
    payload: {id: ordered.robotCommandLogs[0].id, ok: true, message: '離線指令完成：DELIVERY_START', simulated: true},
  });
  assert.equal(simulatedMarked.robotCommandLogs[0].status, 'simulated');
  assert.equal(simulatedMarked.hardwareMode, ordered.hardwareMode);
  assert.equal(simulatedMarked.logs[0].message.includes('離線指令'), true);

  const restored = appReducer(initial, {
    type: 'RESTORE_DEMO_STATE',
    payload: {state: partiallyRecovered},
    now: '2026-04-29T09:30:00.000+08:00',
  });
  assert.equal(restored.orders[0].id, 'order-live');
  assert.equal(restored.logs[0].message.includes('已匯入操作資料'), true);

  const reloadSource = appReducer(restored, {
    type: 'ADD_DISPATCH_TASK',
    payload: {zone: 'C', taskType: 'patrol'},
    now: '2026-04-29T09:35:00.000+08:00',
  });
  let persistedAfterLoad = '';
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => JSON.stringify(reloadSource),
        setItem: (_key: string, value: string) => {
          persistedAfterLoad = value;
        },
      },
    },
  });
  const reloaded = loadPersistedState();
  assert.equal(reloaded.tasks.length, reloadSource.tasks.length);
  assert.equal(reloaded.tasks[0].id, reloadSource.tasks[0].id);
  assert.equal(JSON.parse(persistedAfterLoad).tasks.length, reloadSource.tasks.length);
  delete (globalThis as {window?: unknown}).window;

  const reply = await generateTeacherReply('文藝復興三傑是誰？');
  assert.match(reply, /達文西|米開朗基羅|拉斐爾/);
  const classSummary = await generateClassSummary(resolved);
  assert.match(classSummary, /專注|告警|課堂/);
  const insights = await generateStudentInsights(resolved.studentReports[alert.studentId]);
  assert.ok(insights.length >= 2);
  const recommendation = await generateDispatchRecommendation('B', 'broadcast');
  assert.match(recommendation, /區域 B|疏導/);

  const reportHtml = createPrintableReportHtml({
    state: resolved,
    kind: 'class',
    title: '101 教室歷史課報告',
  });
  assert.match(reportHtml, /<!doctype html>/i);
  assert.match(reportHtml, /101 教室歷史課報告/);
  assert.match(reportHtml, /window.print/);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
