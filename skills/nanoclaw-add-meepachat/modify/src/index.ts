import path from 'path';
import { loadState, saveState } from './db.js';
import { logger } from './logger.js';
import {
  POLL_INTERVAL,
  SCHEDULER_POLL_INTERVAL,
  IPC_POLL_INTERVAL,
  MAX_CONCURRENT_CONTAINERS,
  STORE_DIR,
  GROUPS_DIR,
  DATA_DIR,
} from './config.js';
import { getRegisteredChannelNames, getChannelFactory } from './channels/registry.js';
import { processMessage } from './router.js';
import { startTaskScheduler } from './task-scheduler.js';
import { startIpcWatcher } from './ipc.js';

// Channel imports — each self-registers via registerChannel()
import './channels/telegram.js';
import './channels/whatsapp.js';
import './channels/meepachat.js';

// --- Channel state ---
const channels: import('./types.js').Channel[] = [];

const channelOpts = {
  onMessage: (jid: string, msg: any) => {
    processMessage(jid, msg);
  },
  onChatMetadata: (jid: string, timestamp: string, name: string, platform: string, isGroup: boolean) => {
    logger.debug({ jid, name, platform }, 'Chat metadata received');
  },
  registeredGroups: () => loadState().registeredGroups,
};

async function main() {
  logger.info('Starting NanoClaw orchestrator');

  // Initialize channels
  for (const name of getRegisteredChannelNames()) {
    const factory = getChannelFactory(name);
    const channel = factory?.(channelOpts);
    if (channel) {
      await channel.connect();
      channels.push(channel);
    }
  }

  logger.info({ channels: channels.map(c => c.name) }, 'Channels connected');

  // Start message polling loop
  setInterval(() => {
    // Poll and process queued messages
  }, POLL_INTERVAL);

  // Start task scheduler
  startTaskScheduler();

  // Start IPC watcher
  startIpcWatcher();
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error in orchestrator');
  process.exit(1);
});
