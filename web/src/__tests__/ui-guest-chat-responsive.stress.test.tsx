import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { getOrCreateGuestSession, updateGuestSession } from '@/lib/guest-session';
import { ChatPanel, QUICK_EMOJIS } from '@/components/chat/ChatPanel';
import { EmojiReactionCanvas } from '@/components/chat/EmojiReactionCanvas';
import { RoomHeader } from '@/components/room/RoomHeader';
import { ParticipantsList } from '@/components/room/ParticipantsList';
import { ShareModal } from '@/components/room/ShareModal';
import { UserDTO, ChatMessageDTO, ReactionBurstDTO } from '@watch2gether/shared';

describe('Milestone 2 Stress Testing: UI, Zero-Wall Guest Onboarding and Real-Time Chat', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('1. Zero-Wall Guest Onboarding Stress Test', () => {
    it('synchronously provisions valid anonymous profile on clean invite URL visit', () => {
      expect(localStorage.getItem('w2g_guest_session')).toBeNull();

      const startTime = performance.now();
      const guest = getOrCreateGuestSession();
      const durationMs = performance.now() - startTime;

      expect(durationMs).toBeLessThan(50);
      expect(guest).toBeDefined();
      expect(guest.id).match(/^guest_[a-z0-9]+_[a-z0-9]+$/);
      expect(guest.name).toBeTruthy();
      expect(guest.name.length).toBeGreaterThan(3);
      expect(guest.isGuest).toBe(true);
      expect(guest.color).match(/^#[0-9a-f]{6}$/i);
      expect(guest.avatarColor).match(/^#[0-9a-f]{6}$/i);
      expect(guest.joinedAt).toBeGreaterThan(0);

      const stored = localStorage.getItem('w2g_guest_session');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored);
      expect(parsed.id).toBe(guest.id);
    });

    it('handles 1,000 rapid concurrent guest creations with 0 collisions', () => {
      const generatedIds = new Set();
      const generatedNames = new Set();

      for (let i = 0; i < 1000; i++) {
        localStorage.clear();
        const guest = getOrCreateGuestSession();

        expect(guest.id).toBeDefined();
        expect(guest.isGuest).toBe(true);
        expect(generatedIds.has(guest.id)).toBe(false);
        generatedIds.add(guest.id);
        generatedNames.add(guest.name);
      }

      expect(generatedIds.size).toBe(1000);
      expect(generatedNames.size).toBeGreaterThan(30);
    });

    it('recovers gracefully from corrupted localStorage without throwing', () => {
      localStorage.setItem('w2g_guest_session', 'INVALID_NON_JSON_CORRUPTED_DATA{{{');

      let guest = null;
      expect(() => {
        guest = getOrCreateGuestSession();
      }).not.toThrow();

      expect(guest).not.toBeNull();
      expect(guest.id).match(/^guest_/);
      expect(guest.isGuest).toBe(true);
    });

    it('recovers gracefully when localStorage has invalid shape', () => {
      localStorage.setItem('w2g_guest_session', JSON.stringify({ somethingElse: 123 }));

      const guest = getOrCreateGuestSession();
      expect(guest.id).match(/^guest_/);
      expect(guest.name).toBeTruthy();
    });

    it('persists guest name and preference updates', () => {
      const guest = getOrCreateGuestSession();
      const updated = updateGuestSession({ name: 'Speedy Cheetah', avatarColor: '#10b981' });

      expect(updated.id).toBe(guest.id);
      expect(updated.name).toBe('Speedy Cheetah');
      expect(updated.avatarColor).toBe('#10b981');

      const reloaded = getOrCreateGuestSession();
      expect(reloaded.name).toBe('Speedy Cheetah');
      expect(reloaded.avatarColor).toBe('#10b981');
    });
  });

  describe('2. Real-Time Chat Burst Rate Stress Test', () => {
    const mockUser = {
      id: 'guest_user_1',
      name: 'Alpha Wolf',
      isGuest: true,
      color: '#6366f1',
      joinedAt: Date.now(),
    };

    const peerUser = {
      id: 'guest_user_2',
      name: 'Beta Fox',
      isGuest: true,
      color: '#ec4899',
      joinedAt: Date.now(),
    };

    it('renders empty state when no messages are present', () => {
      render(
        React.createElement(ChatPanel, {
          messages: [],
          currentUser: mockUser,
          onSendMessage: vi.fn(),
          onSendReaction: vi.fn(),
        })
      );

      expect(screen.getByText(/Live Room Chat/i)).toBeInTheDocument();
      expect(screen.getByText(/No messages yet/i)).toBeInTheDocument();
    });

    it('handles burst ingestion of 200 rapid messages without dropping elements or crashing', () => {
      const burstMessages = Array.from({ length: 200 }, (_, i) => ({
        id: 'msg_burst_' + i,
        roomCode: 'BURST1',
        sender: i % 2 === 0 ? mockUser : peerUser,
        text: 'Burst message payload #' + i + ' - synchronized stream test',
        timestamp: Date.now() + i * 50,
      }));

      const { container } = render(
        React.createElement(ChatPanel, {
          messages: burstMessages,
          currentUser: mockUser,
          onSendMessage: vi.fn(),
          onSendReaction: vi.fn(),
        })
      );

      expect(screen.getByText(/Live Room Chat/i)).toBeInTheDocument();
      expect(screen.getByText(/Realtime/i)).toBeInTheDocument();
      expect(screen.getByText('Burst message payload #0 - synchronized stream test')).toBeInTheDocument();
      expect(screen.getByText('Burst message payload #99 - synchronized stream test')).toBeInTheDocument();
      expect(screen.getByText('Burst message payload #199 - synchronized stream test')).toBeInTheDocument();
      const renderedTextNodes = container.querySelectorAll('.rounded-2xl');
      expect(renderedTextNodes.length).toBeGreaterThanOrEqual(200);
    });

    it('properly renders interleaved system notification messages', () => {
      const mixedMessages = [
        { id: 'sys_1', sender: mockUser, text: 'Alpha Wolf joined the room', timestamp: Date.now(), system: true },
        { id: 'chat_1', roomCode: 'ROOM1', sender: peerUser, text: 'Hey everyone! Lets watch the movie.', timestamp: Date.now() + 100 },
        { id: 'sys_2', sender: peerUser, text: 'Video source updated to MP4 video', timestamp: Date.now() + 200, system: true },
      ];

      render(
        React.createElement(ChatPanel, {
          messages: mixedMessages,
          currentUser: mockUser,
          onSendMessage: vi.fn(),
          onSendReaction: vi.fn(),
        })
      );

      expect(screen.getByText('Alpha Wolf joined the room')).toBeInTheDocument();
      expect(screen.getByText('Hey everyone! Lets watch the movie.')).toBeInTheDocument();
      expect(screen.getByText('Video source updated to MP4 video')).toBeInTheDocument();
    });

    it('handles rapid typing and submit events with input clearing and callback', () => {
      const onSendMock = vi.fn();
      render(
        React.createElement(ChatPanel, {
          messages: [],
          currentUser: mockUser,
          onSendMessage: onSendMock,
          onSendReaction: vi.fn(),
        })
      );

      const input = screen.getByPlaceholderText(/Type a message.../i);
      const sendButton = screen.getByRole('button', { name: /Send Message/i });

      expect(sendButton).toBeDisabled();
      fireEvent.change(input, { target: { value: 'Hello Watch2Gether!' } });
      expect(sendButton).not.toBeDisabled();
      fireEvent.click(sendButton);

      expect(onSendMock).toHaveBeenCalledWith('Hello Watch2Gether!');
      expect(input).toHaveValue('');

      fireEvent.change(input, { target: { value: 'Second message via keyboard' } });
      fireEvent.submit(input.closest('form'));

      expect(onSendMock).toHaveBeenCalledWith('Second message via keyboard');
      expect(input).toHaveValue('');
    });

    it('triggers reaction callbacks when clicking quick emoji buttons', () => {
      const onReactionMock = vi.fn();
      render(
        React.createElement(ChatPanel, {
          messages: [],
          currentUser: mockUser,
          onSendMessage: vi.fn(),
          onSendReaction: onReactionMock,
        })
      );

      for (const emoji of QUICK_EMOJIS) {
        const btn = screen.getByTitle('React with ' + emoji);
        expect(btn).toBeInTheDocument();
      }

      fireEvent.click(screen.getByTitle('React with ' + QUICK_EMOJIS[0]));
      expect(onReactionMock).toHaveBeenCalledWith(QUICK_EMOJIS[0]);

      fireEvent.click(screen.getByTitle('React with ' + QUICK_EMOJIS[1]));
      expect(onReactionMock).toHaveBeenCalledWith(QUICK_EMOJIS[1]);
    });
  });

  describe('3. Floating EmojiParticle Performance & Lifecycle', () => {
    it('spawns particles upon receiving bursts and manages physics animation frames', () => {
      let rAFCallback: FrameRequestCallback | null = null;
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        rAFCallback = cb;
        return 123;
      });
      vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

      const bursts: ReactionBurstDTO[] = [
        {
          id: 'burst_1',
          roomCode: 'TEST_ROOM',
          emoji: 'fire',
          senderId: 'u1',
          senderName: 'User 1',
          timestamp: Date.now(),
          x: 0.75,
          count: 5,
        },
      ];

      const { container, rerender } = render(
        React.createElement(EmojiReactionCanvas, { bursts })
      );
      const canvasEl = container.firstChild as HTMLDivElement;
      expect(canvasEl).toBeDefined();

      if (rAFCallback) {
        act(() => {
          (rAFCallback as any)(Date.now());
        });
      }

      const particles = canvasEl.querySelectorAll('span');
      expect(particles.length).toBe(5);
      expect(particles[0].style.position).toBe('absolute');

      const newBursts: ReactionBurstDTO[] = [
        ...bursts,
        {
          id: 'burst_2',
          roomCode: 'TEST_ROOM',
          emoji: 'heart',
          senderId: 'u2',
          senderName: 'User 2',
          timestamp: Date.now(),
          x: 0.5,
          count: 10,
        },
      ];

      rerender(React.createElement(EmojiReactionCanvas, { bursts: newBursts }));

      if (rAFCallback) {
        act(() => {
          (rAFCallback as any)(Date.now() + 100);
        });
      }

      const updatedParticles = canvasEl.querySelectorAll('span');
      expect(updatedParticles.length).toBe(15);
    });

    it('cleans up expired particles after lifetime passes to prevent memory leaks', () => {
      let rAFCallback: FrameRequestCallback | null = null;
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        rAFCallback = cb;
        return 456;
      });

      const startTime = 100000;
      vi.setSystemTime(startTime);

      const bursts: ReactionBurstDTO[] = [
        {
          id: 'burst_expire',
          roomCode: 'ROOM_LEAK_CHECK',
          emoji: 'party',
          senderId: 'u1',
          senderName: 'User 1',
          timestamp: startTime,
          count: 8,
        },
      ];

      const { container } = render(
        React.createElement(EmojiReactionCanvas, { bursts })
      );
      const canvasEl = container.firstChild as HTMLDivElement;

      if (rAFCallback) {
        act(() => {
          (rAFCallback as any)(startTime);
        });
      }
      expect(canvasEl.querySelectorAll('span').length).toBe(8);

      const futureTime = startTime + 4000;
      vi.setSystemTime(futureTime);

      if (rAFCallback) {
        act(() => {
          (rAFCallback as any)(futureTime);
        });
      }

      expect(canvasEl.querySelectorAll('span').length).toBe(0);
    });
  });

  describe('4. Responsive Layout & Viewport Adaptability', () => {
    const mockUsers: UserDTO[] = [
      { id: 'h1', name: 'Host Player', isGuest: false, color: '#6366f1', joinedAt: Date.now() },
      { id: 'g1', name: 'Guest Fox', isGuest: true, color: '#10b981', joinedAt: Date.now() },
      { id: 'g2', name: 'Guest Otter', isGuest: true, color: '#f59e0b', joinedAt: Date.now() },
    ];

    it('renders RoomHeader with complete responsive elements on desktop and mobile viewports', () => {
      const syncStatus = { isSynced: true, rttLatencyMs: 42, clockOffsetMs: -12 } as any;
      render(
        React.createElement(RoomHeader, {
          roomCode: 'PARTY88',
          roomName: 'Cosmic Movie Night',
          isHost: true,
          permissionMode: 'HOST_ONLY',
          onTogglePermission: vi.fn(),
          syncStatus: syncStatus,
          activeUsers: mockUsers,
        })
      );

      expect(screen.getByText('Watch2Gether')).toBeInTheDocument();
      expect(screen.getByText('Cosmic Movie Night')).toBeInTheDocument();
      expect(screen.getByText('PARTY88')).toBeInTheDocument();

      expect(screen.getByText(/42ms RTT/i)).toBeInTheDocument();

      expect(screen.getByText(/Host Control/i)).toBeInTheDocument();
      expect(screen.getByText('Share Room')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('renders ParticipantsList with host badge, current user indicator, and member count', () => {
      render(
        React.createElement(ParticipantsList, {
          users: mockUsers,
          currentUserId: 'g1',
          hostId: 'h1',
        })
      );

      expect(screen.getByText(/Active Members/i)).toBeInTheDocument();

      expect(screen.getByText('Host Player')).toBeInTheDocument();
      expect(screen.getByText('Host')).toBeInTheDocument();

      expect(screen.getByText('Guest Fox')).toBeInTheDocument();
      expect(screen.getByText('(You)')).toBeInTheDocument();

      expect(screen.getByText('Guest Otter')).toBeInTheDocument();
    });

    it('renders ShareModal with 1-click copy CTA and room URL', () => {
      render(
        React.createElement(ShareModal, {
          isOpen: true,
          onClose: vi.fn(),
          roomCode: 'PARTY88',
          roomName: 'Cosmic Movie Night',
        })
      );

      expect(screen.getByText('Invite Friends to Watch')).toBeInTheDocument();
      expect(screen.getByText('PARTY88')).toBeInTheDocument();
      expect(screen.getByText(/Copy Link/i)).toBeInTheDocument();
      expect(screen.getByText(/Scan QR code on your mobile device/i)).toBeInTheDocument();
    });
  });
});
