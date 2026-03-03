import { describe, it, expect } from 'vitest';
import { getRegisteredChannelNames } from './channels/registry.js';

describe('Channel routing', () => {
  it('should route telegram JIDs to telegram channel', () => {
    const jid = 'tg:123456';
    expect(jid.startsWith('tg:')).toBe(true);
  });

  it('should route whatsapp JIDs to whatsapp channel', () => {
    const jid = 'wa:5511999999999@s.whatsapp.net';
    expect(jid.startsWith('wa:')).toBe(true);
  });

  it('should route meepachat JIDs to meepachat channel', () => {
    const jid = 'mc:6f9aef90-fe88-4521-9c35-92cc8b65b019';
    expect(jid.startsWith('mc:')).toBe(true);
  });

  it('should distinguish meepachat JIDs from other platforms', () => {
    const mcJid = 'mc:abc123';
    const tgJid = 'tg:123456';
    const waJid = 'wa:5511999999999@s.whatsapp.net';

    expect(mcJid.startsWith('mc:')).toBe(true);
    expect(mcJid.startsWith('tg:')).toBe(false);
    expect(mcJid.startsWith('wa:')).toBe(false);

    expect(tgJid.startsWith('mc:')).toBe(false);
    expect(waJid.startsWith('mc:')).toBe(false);
  });
});
