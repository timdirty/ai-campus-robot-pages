import assert from 'node:assert/strict';
import {describeAcousticSignal} from '../services/acousticGuardian';
import {generateSupportReply, summarizeGuardianState} from '../services/localGuardianAi';
import {evaluateProactiveGuardianState} from '../services/proactiveGuardian';
import {buildSchoolZoneStatuses} from '../services/schoolSpaces';
import {createInitialGuardianState, guardianReducer, normalizeGuardianState} from './guardianState';

async function run() {
  const initial = createInitialGuardianState();
  assert.equal(initial.privacyMode, true);
  assert.equal(initial.alerts.length, 2);
  assert.ok(initial.nodes.some((node) => node.status === 'offline'));
  assert.ok(initial.hardwareEvents.some((event) => event.command === 'SYSTEM_READY'));
  assert.ok(initial.acousticSignals.some((signal) => signal.source === 'demo'));
  assert.ok(initial.robotMissions.some((mission) => mission.zoneName === '圖書館'));

  const seeded = guardianReducer(initial, {
    type: 'CREATE_CONTEXT_ALERT',
    payload: {
      location: '圖書館',
      type: '測試關懷提醒',
      description: '測試用提醒，確認 checklist 與狀態流程。',
      riskLevel: 'medium',
      category: '測試',
    },
  });

  const mooded = guardianReducer(seeded, {
    type: 'ADD_MOOD',
    payload: {mood: 'worried', label: '有點擔心', note: '考前壓力'},
  });
  assert.equal(mooded.moodLogs[0].mood, 'worried');
  assert.ok(mooded.stabilityScore < seeded.stabilityScore);

  const alert = mooded.alerts.find((item) => item.status === 'new');
  assert.ok(alert, 'fixture should include a new alert');
  const checked = guardianReducer(mooded, {
    type: 'TOGGLE_CHECKLIST',
    payload: {alertId: alert.id, itemId: alert.checklist[1].id},
  });
  const checkedAlert = checked.alerts.find((item) => item.id === alert.id);
  assert.equal(checkedAlert?.status, 'processing');
  assert.equal(checkedAlert?.checklist[1].completed, true);

  const deployed = guardianReducer(checked, {
    type: 'DEPLOY_INTERVENTION',
    payload: {area: alert.location},
  });
  assert.equal(deployed.interventions[0].area, alert.location);

  const offlineNode = deployed.nodes.find((node) => node.status === 'offline');
  assert.ok(offlineNode, 'fixture should include an offline node');
  const restarted = guardianReducer(deployed, {
    type: 'RESTART_NODE',
    payload: {id: offlineNode.id},
  });
  assert.equal(restarted.nodes.find((node) => node.id === offlineNode.id)?.status, 'online');

  const hardwareRecorded = guardianReducer(restarted, {
    type: 'RECORD_HARDWARE_EVENT',
    payload: {command: 'NODE_RESTART', source: 'test:node', status: 'fallback', message: 'No board connected'},
  });
  assert.equal(hardwareRecorded.hardwareEvents[0].command, 'NODE_RESTART');
  assert.equal(hardwareRecorded.hardwareEvents[0].status, 'fallback');

  const acoustic = describeAcousticSignal(84, 38);
  assert.equal(acoustic.level, 'elevated');
  const acousticRecorded = guardianReducer(hardwareRecorded, {
    type: 'RECORD_ACOUSTIC_SIGNAL',
    payload: {source: 'microphone', location: '穿堂', ...acoustic},
  });
  assert.equal(acousticRecorded.acousticSignals[0].level, 'elevated');
  assert.match(acousticRecorded.nodes.find((node) => node.id === 'node-hall')?.lastEvent ?? '', /本機聲量分析/);

  const acousticAlerted = guardianReducer(acousticRecorded, {
    type: 'CREATE_ACOUSTIC_ALERT',
    payload: {location: '穿堂', ...acoustic},
  });
  assert.equal(acousticAlerted.alerts[0].type, '環境聲量提醒');
  assert.equal(acousticAlerted.alerts[0].riskLevel, 'medium');

  const proactive = evaluateProactiveGuardianState(acousticAlerted);
  assert.ok(proactive.score >= 4);
  const proactiveAlerted = guardianReducer(acousticAlerted, {
    type: 'CREATE_PROACTIVE_ALERT',
    payload: proactive,
  });
  assert.equal(proactiveAlerted.alerts[0].studentAlias, 'AI 主動巡查');
  assert.equal(proactiveAlerted.alerts[0].category, '多來源融合');

  const zones = buildSchoolZoneStatuses(proactiveAlerted);
  assert.ok(zones.some((zone) => zone.name === '穿堂' && zone.riskScore > 0));
  const hallZone = zones.find((zone) => zone.name === '穿堂');
  assert.ok(hallZone);
  const robotDispatched = guardianReducer(proactiveAlerted, {
    type: 'DISPATCH_ROBOT',
    payload: {zoneName: hallZone.name, riskScore: hallZone.riskScore, command: 'ROBOT_DISPATCH'},
  });
  assert.equal(robotDispatched.robotMissions[0].zoneName, '穿堂');
  assert.equal(robotDispatched.robotMissions[0].status, 'dispatching');
  const robotCompleted = guardianReducer(robotDispatched, {
    type: 'UPDATE_ROBOT_MISSION_STATUS',
    payload: {zoneName: '穿堂', status: 'completed'},
  });
  assert.equal(robotCompleted.robotMissions[0].status, 'completed');

  const reply = await generateSupportReply('我最近考試壓力很大', 'worried');
  assert.match(reply, /考試|壓力|小步驟|成績|老師|科目|學習/);
  const urgentReply = await generateSupportReply('我想傷害自己', 'worried');
  assert.match(urgentReply, /輔導|1925|安全|信任的大人|緊急救援/);

  const summary = await summarizeGuardianState(restarted);
  assert.match(summary, /校園穩定度/);

  const recovered = normalizeGuardianState({
    privacyMode: false,
    alerts: 'broken',
    nodes: null,
    supportMessages: undefined,
    stabilityScore: 'bad',
  });
  assert.equal(recovered.privacyMode, false);
  assert.equal(recovered.alerts.length, initial.alerts.length);
  assert.equal(recovered.nodes.length, initial.nodes.length);
  assert.equal(recovered.stabilityScore, initial.stabilityScore);

  const partiallyRecovered = normalizeGuardianState({
    stabilityScore: 500,
    alerts: [
      null,
      {
        id: 'custom-alert',
        studentAlias: '',
        checklist: [null, {id: 'custom-check', text: '', completed: 'yes'}],
        riskLevel: 'critical',
        status: 'stuck',
      },
    ],
    nodes: [null, {id: 'node-x', name: '臨時節點', status: 'lost', latencyMs: -10}],
    supportMessages: [null, {role: 'student', content: '需要幫忙'}],
    hardwareEvents: [null, {command: 'CARE_DEPLOYED', source: 'test', status: 'bad', message: 'ok'}],
    acousticSignals: [null, {source: 'microphone', location: '穿堂', level: 'elevated', volumeIndex: 140, volatility: -2, summary: '聲量偏高'}],
    robotMissions: [null, {zoneName: '穿堂', riskScore: 120, status: 'bad', command: 'ROBOT_DISPATCH'}],
  });
  assert.equal(partiallyRecovered.stabilityScore, 100);
  assert.equal(partiallyRecovered.alerts.length, 1);
  assert.equal(partiallyRecovered.alerts[0].id, 'custom-alert');
  assert.equal(partiallyRecovered.alerts[0].riskLevel, 'medium');
  assert.equal(partiallyRecovered.alerts[0].checklist[0].id, 'custom-check');
  assert.equal(partiallyRecovered.nodes.length, 1);
  assert.equal(partiallyRecovered.nodes[0].status, initial.nodes[1].status);
  assert.equal(partiallyRecovered.nodes[0].latencyMs, 0);
  assert.equal(partiallyRecovered.supportMessages[0].content, '需要幫忙');
  assert.equal(partiallyRecovered.hardwareEvents[0].command, 'CARE_DEPLOYED');
  assert.equal(partiallyRecovered.hardwareEvents[0].status, initial.hardwareEvents[0].status);
  assert.equal(partiallyRecovered.acousticSignals[0].source, 'microphone');
  assert.equal(partiallyRecovered.acousticSignals[0].volumeIndex, 100);
  assert.equal(partiallyRecovered.acousticSignals[0].volatility, 0);
  assert.equal(partiallyRecovered.robotMissions[0].zoneName, '穿堂');
  assert.equal(partiallyRecovered.robotMissions[0].riskScore, 100);
  assert.equal(partiallyRecovered.robotMissions[0].status, initial.robotMissions[0].status);

  const restored = guardianReducer(initial, {
    type: 'RESTORE_DEMO_STATE',
    payload: {state: partiallyRecovered},
  });
  assert.equal(restored.alerts[0].id, 'custom-alert');
  assert.equal(restored.supportMessages[0].content, '需要幫忙');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
