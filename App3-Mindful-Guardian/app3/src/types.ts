export interface ZoneSensorReading {
  zoneId: string;
  portPath?: string | null;
  temp: number | null;
  hum: number | null;
  light: number | null;
  connected: boolean;
  updatedAt: string;
}

export interface DetectedPort {
  path: string;
  manufacturer?: string;
  deviceKey?: string;
  assignedZone: string | null;
  assignedDrive?: boolean;
  connected?: boolean;
}
export type RiskLevel = 'high' | 'medium' | 'low';
export type AlertStatus = 'new' | 'processing' | 'resolved';
export type MoodType = 'happy' | 'steady' | 'tired' | 'worried';
export type NodeStatus = 'online' | 'attention' | 'offline';
export type AcousticLevel = 'calm' | 'active' | 'elevated';
export type RobotMissionStatus = 'dispatching' | 'arrived' | 'completed';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface GuardianAlert {
  id: string;
  studentAlias: string;
  className: string;
  location: string;
  time: string;
  type: string;
  description: string;
  riskLevel: RiskLevel;
  category: string;
  status: AlertStatus;
  checklist: ChecklistItem[];
}

export interface GuardianNode {
  id: string;
  name: string;
  location: string;
  status: NodeStatus;
  latencyMs: number;
  load: number;
  signal: number;
  lastEvent: string;
}

export interface SchoolZone {
  id: string;
  name: string;
  location: string;
  nodeId: string;
  x: number;
  y: number;
}

export interface MoodLog {
  id: string;
  mood: MoodType;
  label: string;
  note: string;
  createdAt: string;
}

export interface SupportMessage {
  id: string;
  role: 'student' | 'guardian';
  content: string;
  createdAt: string;
}

export interface ForestPost {
  id: string;
  content: string;
  type: 'thought' | 'gratitude' | 'support';
  likes: number;
  createdAt: string;
  botReply?: string;
}

export interface Intervention {
  id: string;
  title: string;
  description: string;
  status: 'running' | 'planned' | 'completed';
  area: string;
  updatedAt: string;
}

export interface HardwareEvent {
  id: string;
  command: string;
  source: string;
  status: 'sent' | 'fallback';
  message: string;
  createdAt: string;
}

export interface AcousticSignal {
  id: string;
  source: 'microphone' | 'demo';
  location: string;
  level: AcousticLevel;
  volumeIndex: number;
  volatility: number;
  summary: string;
  createdAt: string;
}

export interface RobotMission {
  id: string;
  zoneName: string;
  riskScore: number;
  status: RobotMissionStatus;
  command: string;
  createdAt: string;
}

export interface GuardianState {
  stabilityScore: number;
  teacherWellbeingScore: number;
  privacyMode: boolean;
  alerts: GuardianAlert[];
  nodes: GuardianNode[];
  moodLogs: MoodLog[];
  supportMessages: SupportMessage[];
  forestPosts: ForestPost[];
  interventions: Intervention[];
  hardwareEvents: HardwareEvent[];
  acousticSignals: AcousticSignal[];
  robotMissions: RobotMission[];
  lastUpdated: string;
}
