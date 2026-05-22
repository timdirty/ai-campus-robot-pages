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

// --- Log types ---

export interface DeliveryLogEntry {
  id: number;
  createdAt: string;
  command: string;
  destination?: string;
  status: 'sent' | 'failed' | 'simulated';
  message?: string;
}

export interface TaskLogEntry {
  id: number;
  createdAt: string;
  taskType: string;
  description: string;
  status: 'pending' | 'in_progress' | 'done' | 'cancelled';
}

const deliveryLogFile = path.join(dataDir, 'delivery-log.json');
const taskLogFile = path.join(dataDir, 'task-log.json');

export async function appendDeliveryLog(entry: Omit<DeliveryLogEntry, 'id' | 'createdAt'>): Promise<DeliveryLogEntry[]> {
  const current = await readJsonFile<DeliveryLogEntry[]>(deliveryLogFile, []);
  const next: DeliveryLogEntry[] = [
    {id: Date.now(), createdAt: new Date().toISOString(), ...entry},
    ...current,
  ].slice(0, 100);
  await writeJsonFile(deliveryLogFile, next);
  return next;
}

export async function appendTaskLog(entry: Omit<TaskLogEntry, 'id' | 'createdAt'>): Promise<TaskLogEntry[]> {
  const current = await readJsonFile<TaskLogEntry[]>(taskLogFile, []);
  const next: TaskLogEntry[] = [
    {id: Date.now(), createdAt: new Date().toISOString(), ...entry},
    ...current,
  ].slice(0, 100);
  await writeJsonFile(taskLogFile, next);
  return next;
}

export async function getRecentDeliveryLogs(): Promise<DeliveryLogEntry[]> {
  return readJsonFile<DeliveryLogEntry[]>(deliveryLogFile, []);
}

export async function getRecentTaskLogs(): Promise<TaskLogEntry[]> {
  return readJsonFile<TaskLogEntry[]>(taskLogFile, []);
}

export async function resetDemoData(): Promise<void> {
  await writeJsonFile(deliveryLogFile, []);
  await writeJsonFile(taskLogFile, []);
}
