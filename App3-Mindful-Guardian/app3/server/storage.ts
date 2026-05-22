import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.join(process.cwd(), 'data');

export async function ensureDataDir(): Promise<void> {
  await mkdir(dataDir, {recursive: true});
}

export async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  await ensureDataDir();
  try {
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    if (typeof fallback === 'object' && fallback !== null && typeof parsed !== 'object') return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile<T>(file: string, value: T): Promise<void> {
  await ensureDataDir();
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

// --- Data types ---

export interface AlertLogEntry {
  id: number;
  createdAt: string;
  zoneId: string;
  alertType: string;
  severity: 'high' | 'medium' | 'low';
  message?: string;
  resolved: boolean;
}

const alertLogFile = path.join(dataDir, 'alert-log.json');
const assignmentsFile = path.join(dataDir, 'sensor-assignments.json');
const driveAssignmentFile = path.join(dataDir, 'drive-assignment.json');

export interface StoredPortZoneAssignment {
  portPath: string;
  zoneId: string;
  deviceKey?: string | null;
  assignedAt?: string;
}

interface StoredPortZoneAssignmentsPayload {
  version: 2;
  assignments: StoredPortZoneAssignment[];
}

export interface StoredDriveAssignment {
  portPath: string | null;
  deviceKey?: string | null;
  assignedAt?: string;
}

export async function appendAlertLog(entry: Omit<AlertLogEntry, 'id' | 'createdAt'>): Promise<AlertLogEntry[]> {
  const current = await readJsonFile<AlertLogEntry[]>(alertLogFile, []);
  const next: AlertLogEntry[] = [
    {id: Date.now(), createdAt: new Date().toISOString(), ...entry},
    ...current,
  ].slice(0, 200);
  await writeJsonFile(alertLogFile, next);
  return next;
}

export async function getAlertLogs(): Promise<AlertLogEntry[]> {
  return readJsonFile<AlertLogEntry[]>(alertLogFile, []);
}

export async function loadPortZoneAssignments(): Promise<StoredPortZoneAssignment[]> {
  const payload = await readJsonFile<Record<string, string> | StoredPortZoneAssignmentsPayload>(assignmentsFile, {});
  if ('version' in payload && payload.version === 2 && Array.isArray(payload.assignments)) {
    return payload.assignments
      .filter((item) => typeof item.portPath === 'string' && typeof item.zoneId === 'string')
      .map((item) => ({
        portPath: item.portPath.trim(),
        zoneId: item.zoneId.trim(),
        deviceKey: typeof item.deviceKey === 'string' && item.deviceKey.trim() ? item.deviceKey.trim() : null,
        assignedAt: typeof item.assignedAt === 'string' ? item.assignedAt : undefined,
      }))
      .filter((item) => item.portPath && item.zoneId);
  }
  return Object.entries(payload)
    .filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
    .map(([portPath, zoneId]) => ({portPath, zoneId}));
}

export async function savePortZoneAssignments(assignments: StoredPortZoneAssignment[] | Record<string, string>): Promise<void> {
  const now = new Date().toISOString();
  const normalized = Array.isArray(assignments)
    ? assignments
      .filter((item) => item.portPath && item.zoneId)
      .map((item) => ({
        portPath: item.portPath,
        zoneId: item.zoneId,
        deviceKey: item.deviceKey ?? null,
        assignedAt: item.assignedAt ?? now,
      }))
    : Object.entries(assignments).map(([portPath, zoneId]) => ({portPath, zoneId, deviceKey: null, assignedAt: now}));
  await writeJsonFile<StoredPortZoneAssignmentsPayload>(assignmentsFile, {version: 2, assignments: normalized});
}

export async function clearPortZoneAssignments(): Promise<void> {
  await writeJsonFile(assignmentsFile, {});
}

export async function loadDrivePortAssignment(): Promise<StoredDriveAssignment | null> {
  const payload = await readJsonFile<{portPath?: string | null; deviceKey?: string | null; assignedAt?: string}>(driveAssignmentFile, {});
  const portPath = typeof payload.portPath === 'string' && payload.portPath.trim() ? payload.portPath.trim() : null;
  const deviceKey = typeof payload.deviceKey === 'string' && payload.deviceKey.trim() ? payload.deviceKey.trim() : null;
  if (!portPath && !deviceKey) return null;
  return {
    portPath,
    deviceKey,
    assignedAt: typeof payload.assignedAt === 'string' ? payload.assignedAt : undefined,
  };
}

export async function saveDrivePortAssignment(assignment: string | null | StoredDriveAssignment): Promise<void> {
  const payload = typeof assignment === 'string' || assignment === null
    ? {portPath: assignment, deviceKey: null, assignedAt: assignment ? new Date().toISOString() : null}
    : {
        portPath: assignment.portPath,
        deviceKey: assignment.deviceKey ?? null,
        assignedAt: assignment.assignedAt ?? (assignment.portPath || assignment.deviceKey ? new Date().toISOString() : null),
      };
  await writeJsonFile(driveAssignmentFile, payload);
}

export async function resetDemoData(): Promise<void> {
  await writeJsonFile(alertLogFile, []);
  await writeJsonFile(assignmentsFile, {});
}
