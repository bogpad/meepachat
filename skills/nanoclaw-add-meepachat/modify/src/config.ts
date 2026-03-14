import path from 'path';
import os from 'os';

export const ASSISTANT_NAME = process.env.ASSISTANT_NAME || 'Andy';
export const POLL_INTERVAL = 2000;              // Message poll interval (ms)
export const SCHEDULER_POLL_INTERVAL = 60000;   // Task scheduler poll (ms)
export const IPC_POLL_INTERVAL = 1000;          // IPC watcher poll (ms)
export const IDLE_TIMEOUT = 1800000;            // Container idle timeout (30 min)
export const CONTAINER_TIMEOUT = 1800000;       // Hard container timeout (30 min)
export const MAX_CONCURRENT_CONTAINERS = 5;     // Global concurrency limit

export const TRIGGER_PATTERN = new RegExp(`^@${ASSISTANT_NAME}\\b`, 'i');

// Paths (absolute for container mounts)
export const STORE_DIR = path.resolve(process.cwd(), 'store');
export const GROUPS_DIR = path.resolve(process.cwd(), 'groups');
export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const MOUNT_ALLOWLIST_PATH = path.join(os.homedir(), '.config', 'nanoclaw', 'mount-allowlist.json');

// MeepaChat configuration
export const MEEPACHAT_BOT_TOKEN = process.env.MEEPACHAT_BOT_TOKEN || '';
// Or use cloud at https://chat.meepachat.ai
export const MEEPACHAT_BASE_URL = process.env.MEEPACHAT_BASE_URL || '';
