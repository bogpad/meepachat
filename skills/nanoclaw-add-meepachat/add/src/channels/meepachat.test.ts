import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeepaChatChannel } from './meepachat.js';

function createChannel(overrides?: Partial<any>) {
  const opts = {
    onMessage: vi.fn(),
    onChatMetadata: vi.fn(),
    registeredGroups: () => ({
      'mc:ch-1': { name: 'test', folder: 'test', trigger: '@nano', platform: 'meepachat', added_at: '' },
    }),
    ...overrides,
  };
  const channel = new MeepaChatChannel('test-token', 'https://chat.example.com', opts);
  return { channel, opts };
}

describe('MeepaChatChannel', () => {
  it('should have name "meepachat"', () => {
    const { channel } = createChannel();
    expect(channel.name).toBe('meepachat');
  });

  it('ownsJid returns true for mc: prefixed JIDs', () => {
    const { channel } = createChannel();
    expect(channel.ownsJid('mc:abc-123')).toBe(true);
    expect(channel.ownsJid('tg:123')).toBe(false);
    expect(channel.ownsJid('wa:123')).toBe(false);
  });

  it('isConnected returns false before connect', () => {
    const { channel } = createChannel();
    expect(channel.isConnected()).toBe(false);
  });

  describe('handleEvent (via private access)', () => {
    let channel: MeepaChatChannel;
    let opts: any;
    let handleEvent: (event: any) => void;

    beforeEach(() => {
      const created = createChannel();
      channel = created.channel;
      opts = created.opts;
      handleEvent = (channel as any).handleEvent.bind(channel);
      // Simulate ready state with a bot user
      (channel as any).botUser = { id: 'bot-1', username: 'nano' };
      (channel as any).channels.set('ch-1', {
        id: 'ch-1',
        name: 'general',
        serverId: 'srv-1',
        serverName: 'Test Server',
        jid: 'mc:ch-1',
      });
    });

    it('should process message.created and deliver to onMessage', () => {
      handleEvent({
        type: 'message.created',
        data: {
          id: 'msg-1',
          userId: 'user-1',
          channelId: 'ch-1',
          content: '@nano hello',
          createdAt: '2026-01-01T00:00:00Z',
          user: { username: 'alice', displayName: 'Alice' },
          mentions: [],
        },
      });

      expect(opts.onMessage).toHaveBeenCalledOnce();
      expect(opts.onMessage.mock.calls[0][0]).toBe('mc:ch-1');
      expect(opts.onMessage.mock.calls[0][1].content).toBe('@nano hello');
    });

    it('should ignore messages from own bot', () => {
      handleEvent({
        type: 'message.created',
        data: {
          id: 'msg-2',
          userId: 'bot-1',
          channelId: 'ch-1',
          content: 'response',
          createdAt: '2026-01-01T00:00:00Z',
          user: { username: 'nano' },
          mentions: [],
        },
      });

      expect(opts.onMessage).not.toHaveBeenCalled();
    });

    it('should ignore messages from other bots', () => {
      handleEvent({
        type: 'message.created',
        data: {
          id: 'msg-3',
          userId: 'bot-2',
          channelId: 'ch-1',
          content: 'bot spam',
          createdAt: '2026-01-01T00:00:00Z',
          user: { username: 'meepa2', bot: true },
          mentions: [],
        },
      });

      expect(opts.onMessage).not.toHaveBeenCalled();
    });

    it('should deduplicate messages by ID', () => {
      const msg = {
        type: 'message.created',
        data: {
          id: 'msg-dup',
          userId: 'user-1',
          channelId: 'ch-1',
          content: 'hello',
          createdAt: '2026-01-01T00:00:00Z',
          user: { username: 'alice' },
          mentions: [],
        },
      };

      handleEvent(msg);
      handleEvent(msg);

      expect(opts.onMessage).toHaveBeenCalledOnce();
    });

    it('should handle message.updated without error', () => {
      expect(() => {
        handleEvent({
          type: 'message.updated',
          data: { id: 'msg-1', channelId: 'ch-1', content: 'edited' },
        });
      }).not.toThrow();
    });

    it('should handle message.deleted and clear from processed set', () => {
      // First process a message
      handleEvent({
        type: 'message.created',
        data: {
          id: 'msg-del',
          userId: 'user-1',
          channelId: 'ch-1',
          content: 'to be deleted',
          createdAt: '2026-01-01T00:00:00Z',
          user: { username: 'alice' },
          mentions: [],
        },
      });

      expect(opts.onMessage).toHaveBeenCalledOnce();

      // Delete it
      handleEvent({
        type: 'message.deleted',
        data: { messageId: 'msg-del', channelId: 'ch-1' },
      });

      // Should be removed from processed set, so re-send would work
      expect((channel as any).processedMessages.has('msg-del')).toBe(false);
    });

    it('should handle reaction.sync without error', () => {
      expect(() => {
        handleEvent({
          type: 'reaction.sync',
          data: { channelId: 'ch-1', messageId: 'msg-1' },
        });
      }).not.toThrow();
    });

    it('should handle ready event and map channels', () => {
      (channel as any).channels.clear();

      handleEvent({
        type: 'ready',
        data: {
          user: { id: 'bot-1', username: 'nano' },
          servers: [{
            id: 'srv-1',
            name: 'Test',
            channels: [{ id: 'ch-new', name: 'random' }],
          }],
          dmChannels: [{ id: 'dm-1' }],
        },
      });

      expect((channel as any).channels.has('ch-new')).toBe(true);
      expect((channel as any).channels.has('dm-1')).toBe(true);
      expect((channel as any).channels.get('dm-1').isDM).toBe(true);
    });

    it('should skip messages from unregistered channels', () => {
      handleEvent({
        type: 'message.created',
        data: {
          id: 'msg-unreg',
          userId: 'user-1',
          channelId: 'ch-1',
          content: 'hello',
          createdAt: '2026-01-01T00:00:00Z',
          user: { username: 'alice' },
          mentions: [],
        },
      });

      // ch-1 is registered, should deliver
      expect(opts.onMessage).toHaveBeenCalledOnce();

      // Now try unregistered channel
      (channel as any).channels.set('ch-unreg', {
        id: 'ch-unreg',
        name: 'unregistered',
        serverId: 'srv-1',
        serverName: 'Test',
        jid: 'mc:ch-unreg',
      });

      handleEvent({
        type: 'message.created',
        data: {
          id: 'msg-unreg-2',
          userId: 'user-1',
          channelId: 'ch-unreg',
          content: 'hello',
          createdAt: '2026-01-01T00:00:00Z',
          user: { username: 'alice' },
          mentions: [],
        },
      });

      // Still only called once (from the registered channel)
      expect(opts.onMessage).toHaveBeenCalledOnce();
    });
  });

  describe('setTyping', () => {
    it('should not throw when not connected', async () => {
      const { channel } = createChannel();
      await expect(channel.setTyping('mc:ch-1', true)).resolves.not.toThrow();
    });

    it('should no-op when isTyping is false', async () => {
      const { channel } = createChannel();
      await expect(channel.setTyping('mc:ch-1', false)).resolves.not.toThrow();
    });
  });

  describe('sendMessage', () => {
    it('should throw for unknown channel', async () => {
      const { channel } = createChannel();
      await expect(channel.sendMessage('mc:unknown', 'hello')).rejects.toThrow('Channel not found');
    });
  });
});
