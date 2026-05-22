import {GuardianState, RiskLevel, SchoolZone, ZoneSensorReading} from '../types';

export interface SchoolZoneStatus extends SchoolZone {
  nodeStatus: string;
  stability: number;
  alertCount: number;
  riskScore: number;
  riskLevel: RiskLevel;
  summary: string;
  sensor?: ZoneSensorReading;
}

export const schoolZones: SchoolZone[] = [
  {id: 'zone-library', name: '圖書館', location: '圖書館走廊', nodeId: 'node-library', x: 4, y: 6},
  {id: 'zone-hall', name: '穿堂', location: '行政大樓 1F', nodeId: 'node-hall', x: 44, y: 6},
  {id: 'zone-field', name: '操場', location: '操場', nodeId: 'node-restroom', x: 72, y: 28},
];

export function createDemoZoneSensorReadings(now = new Date()): ZoneSensorReading[] {
  const updatedAt = now.toISOString();
  return [
    {zoneId: 'zone-library', portPath: 'demo-sensor-library', temp: 27.8, hum: 62, light: 220, connected: true, updatedAt},
    {zoneId: 'zone-hall', portPath: 'demo-sensor-hall', temp: 31.6, hum: 74, light: 310, connected: true, updatedAt},
    {zoneId: 'zone-field', portPath: 'demo-sensor-field', temp: 34.2, hum: 78, light: 860, connected: true, updatedAt},
  ];
}

export function buildSchoolZoneStatuses(state: GuardianState, sensorReadings: ZoneSensorReading[] = []): SchoolZoneStatus[] {
  return schoolZones.map((zone) => {
    const node = state.nodes.find((item) => item.id === zone.nodeId);
    const zoneAlerts = state.alerts.filter((alert) => alert.status !== 'resolved' && matchesZone(alert.location, zone));
    const acousticSignals = state.acousticSignals.filter((signal) => matchesZone(signal.location, zone));
    const sensor = sensorReadings.find((s) => s.zoneId === zone.id);
    const riskScore = Math.max(
      estimateSensorRisk(sensor),
      estimateAlertRisk(zoneAlerts),
      estimateNodeRisk(node?.status),
      estimateAcousticRisk(acousticSignals),
    );
    const riskLevel: RiskLevel = riskScore >= 68 ? 'high' : riskScore >= 45 ? 'medium' : 'low';
    const stability = Math.max(0, 100 - riskScore);
    const summary =
      !sensor
        ? '等待指派感測器。'
        : riskLevel === 'high'
        ? '建議立即派老師或機器人前往提示與引導。'
        : riskLevel === 'medium'
          ? '建議值週老師觀察，必要時派機器人前往。'
          : '維持一般巡查。';

    return {
      ...zone,
      nodeStatus: node?.status ?? 'unknown',
      stability,
      alertCount: zoneAlerts.length,
      riskScore,
      riskLevel,
      summary,
      sensor,
    };
  });
}

function estimateSensorRisk(sensor?: ZoneSensorReading) {
  if (!sensor) return 0;
  if (!sensor?.connected) return 46;
  let score = 22;

  if (sensor.temp !== null) {
    if (sensor.temp >= 34) score += 34;
    else if (sensor.temp >= 30) score += 20;
    else if (sensor.temp <= 18) score += 10;
  }
  if (sensor.hum !== null) {
    if (sensor.hum >= 78) score += 24;
    else if (sensor.hum >= 70) score += 14;
    else if (sensor.hum <= 30) score += 8;
  }
  if (sensor.light !== null) {
    if (sensor.light <= 120) score += 28;
    else if (sensor.light <= 250) score += 14;
    else if (sensor.light >= 980) score += 6;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function estimateAlertRisk(alerts: GuardianState['alerts']) {
  return alerts.reduce((score, alert) => {
    const alertScore = alert.riskLevel === 'high' ? 78 : alert.riskLevel === 'medium' ? 56 : 28;
    return Math.max(score, alertScore);
  }, 0);
}

function estimateNodeRisk(status?: string) {
  if (status === 'offline') return 64;
  if (status === 'attention') return 42;
  return 0;
}

function estimateAcousticRisk(signals: GuardianState['acousticSignals']) {
  return signals.reduce((score, signal) => {
    const signalScore = signal.level === 'elevated' ? 52 : signal.level === 'active' ? 34 : 18;
    return Math.max(score, signalScore);
  }, 0);
}

function matchesZone(location: string, zone: SchoolZone) {
  return location.includes(zone.name) || zone.location.includes(location) || location.includes(zone.location);
}
