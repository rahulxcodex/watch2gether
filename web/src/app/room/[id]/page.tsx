"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { RoomHeader } from "@/components/room/RoomHeader";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { UnifiedPlayerInstance } from "@/components/player/types";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { EmojiReactionCanvas } from "@/components/chat/EmojiReactionCanvas";
import { ParticipantsList } from "@/components/room/ParticipantsList";
import { MediaShelf } from "@/components/room/MediaShelf";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSyncEngine } from "@/hooks/useSyncEngine";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import { getOrCreateGuestSession } from "@/lib/guest-session";
import { getSocket, TypedSocket, disconnectSocket } from "@/lib/socket";
import {
  UserDTO,
  RoomDTO,
  MediaType,
  PermissionMode,
  ChatMessageDTO,
  ReactionBurstDTO,
  RoomJoinedPayload,
  QueueItemDTO,
  PartnerProgressDTO,
} from "@watch2gether/shared";
import { MessageSquare, Users, ListVideo, AlertCircle } from "lucide-react";

export default function RoomTheaterPage() {
  const params = useParams();
  const rawId = params?.id;
  const roomCode = (Array.isArray(rawId) ? rawId[0] : rawId || "").toUpperCase();

  // Zero-wall guest onboarding session initialized immediately
  const [currentUser, setCurrentUser] = useState<UserDTO>(() => getOrCreateGuestSession());
  const [socket, setSocket] = useState<TypedSocket | null>(null);

  // Room State
  const [roomDetails, setRoomDetails] = useState<RoomDTO>({
    id: "room_" + roomCode.toLowerCase(),
    roomCode,
    name: `Watch Party ${roomCode}`,
    hostId: "",
    mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    mediaType: "MP4",
    permissionMode: "SHARED",
    createdAt: Date.now(),
  });

  const [activeUsers, setActiveUsers] = useState<UserDTO[]>([currentUser]);
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [reactionBursts, setReactionBursts] = useState<ReactionBurstDTO[]>([]);
  const [activeSidebarTab, setActiveSidebarTab] = useState<string>("chat");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // The Shelf / Queue & Partner Progress
  const [queue, setQueue] = useState<QueueItemDTO[]>([]);
  const [partnerProgress, setPartnerProgress] = useState<PartnerProgressDTO | null>(null);

  const playerRef = useRef<UnifiedPlayerInstance | null>(null);

  const isHost = roomDetails.hostId === currentUser.id || !roomDetails.hostId;
  const canControl = roomDetails.permissionMode === "SHARED" || isHost;

  // Initialize WebRTC Voice Chat with Audio Ducking
  const {
    isVoiceActive,
    isMuted: isVoiceMuted,
    isSpeaking,
    isPartnerSpeaking,
    startVoice,
    stopVoice,
    toggleMute: toggleVoiceMute,
  } = useVoiceChat({
    socket,
    roomCode,
    currentUserId: currentUser.id,
  });

  // Initialize Sync Engine
  const {
    authoritativeState,
    syncStatus,
    emitPlay,
    emitPause,
    emitSeek,
    handleIncomingMediaSync,
    snapToAuthoritativeTime,
  } = useSyncEngine({
    socket,
    roomCode,
    currentUser,
    playerRef,
    canControl,
  });

  // Save room to localStorage for 1-click rejoining from homepage
  useEffect(() => {
    if (!roomCode) return;
    try {
      const stored = localStorage.getItem("wtSavedRoomsV1");
      const savedList: Array<{ code: string; name: string; lastVisited: number }> = stored
        ? JSON.parse(stored)
        : [];
      const filtered = savedList.filter((r) => r.code !== roomCode);
      filtered.unshift({
        code: roomCode,
        name: roomDetails.name || `Room ${roomCode}`,
        lastVisited: Date.now(),
      });
      localStorage.setItem("wtSavedRoomsV1", JSON.stringify(filtered.slice(0, 10)));
    } catch (e) {
      // Ignore write error
    }
  }, [roomCode, roomDetails.name]);

  // Connect to Socket and Join Room
  useEffect(() => {
    if (!roomCode) return;

    const guestUser = getOrCreateGuestSession();
    setCurrentUser(guestUser);

    const sock = getSocket();
    setSocket(sock);

    if (!sock.connected) {
      sock.connect();
    }

    const joinPayload = {
      roomCode,
      user: {
        id: guestUser.id,
        name: guestUser.name,
        avatarColor: guestUser.avatarColor || guestUser.color,
        isGuest: guestUser.isGuest,
      },
    };

    // Emit room:join
    sock.emit("room:join", joinPayload, (response) => {
      if (response && response.success && response.data) {
        const { room, users, playbackState } = response.data;
        setRoomDetails(room);
        setActiveUsers(users);
        if (room.queue) setQueue(room.queue);
        if (playbackState) {
          handleIncomingMediaSync(playbackState);
        }
      }
    });

    // Event Listeners
    const onRoomJoined = (payload: RoomJoinedPayload) => {
      setRoomDetails(payload.room);
      setActiveUsers(payload.users || []);
      if (payload.room.queue) setQueue(payload.room.queue);
      if (payload.playbackState) {
        handleIncomingMediaSync(payload.playbackState);
      }
    };

    const onUserJoined = (payload: { user: UserDTO }) => {
      setActiveUsers((prev) => {
        if (prev.some((u) => u.id === payload.user.id)) return prev;
        return [...prev, payload.user];
      });
      setMessages((prev) => [
        ...prev,
        {
          id: "sys_" + Date.now(),
          sender: payload.user,
          text: `${payload.user.name} joined the room`,
          timestamp: Date.now(),
          system: true,
        },
      ]);
    };

    const onUserLeft = (payload: { userId: string; userName?: string; newHostId?: string }) => {
      setActiveUsers((prev) => prev.filter((u) => u.id !== payload.userId));
      if (payload.newHostId) {
        setRoomDetails((prev) => ({ ...prev, hostId: payload.newHostId! }));
      }
      setMessages((prev) => [
        ...prev,
        {
          id: "sys_" + Date.now(),
          sender: { id: payload.userId, name: payload.userName || "Guest", isGuest: true },
          text: `${payload.userName || "A participant"} left the room`,
          timestamp: Date.now(),
          system: true,
        },
      ]);
    };

    const onMediaChanged = (payload: { mediaUrl: string; mediaType: MediaType; name?: string }) => {
      setRoomDetails((prev) => ({
        ...prev,
        mediaUrl: payload.mediaUrl,
        mediaType: payload.mediaType,
      }));
      setMessages((prev) => [
        ...prev,
        {
          id: "sys_" + Date.now(),
          sender: { id: "system", name: "System", isGuest: false },
          text: `Media changed to ${payload.name || payload.mediaUrl}`,
          timestamp: Date.now(),
          system: true,
        },
      ]);
    };

    const onPermissionUpdated = (payload: { permissionMode: PermissionMode }) => {
      setRoomDetails((prev) => ({ ...prev, permissionMode: payload.permissionMode }));
    };

    const onChatMessage = (msg: ChatMessageDTO) => {
      setMessages((prev) => [...prev, msg]);
    };

    const onReactionBurst = (burst: ReactionBurstDTO) => {
      setReactionBursts((prev) => [...prev.slice(-20), burst]);
    };

    const onQueueUpdated = (payload: { queue: QueueItemDTO[] }) => {
      if (payload.queue) setQueue(payload.queue);
    };

    const onPartnerProgress = (payload: PartnerProgressDTO) => {
      if (payload.userId !== currentUser.id) {
        setPartnerProgress(payload);
      }
    };

    sock.on("room:joined", onRoomJoined);
    sock.on("room:user_joined", onUserJoined);
    sock.on("room:member_joined", onUserJoined);
    sock.on("room:user_left", onUserLeft);
    sock.on("room:member_left", onUserLeft);
    sock.on("room:media_changed", onMediaChanged);
    sock.on("room:permission_updated", onPermissionUpdated);
    sock.on("chat:message", onChatMessage);
    sock.on("reaction:burst", onReactionBurst);
    sock.on("queue:updated" as any, onQueueUpdated);
    sock.on("media:progress_update" as any, onPartnerProgress);

    return () => {
      sock.off("room:joined", onRoomJoined);
      sock.off("room:user_joined", onUserJoined);
      sock.off("room:member_joined", onUserJoined);
      sock.off("room:user_left", onUserLeft);
      sock.off("room:member_left", onUserLeft);
      sock.off("room:media_changed", onMediaChanged);
      sock.off("room:permission_updated", onPermissionUpdated);
      sock.off("chat:message", onChatMessage);
      sock.off("reaction:burst", onReactionBurst);
      sock.off("queue:updated" as any, onQueueUpdated);
      sock.off("media:progress_update" as any, onPartnerProgress);
    };
  }, [roomCode, currentUser.id, handleIncomingMediaSync]);

  // Periodic playhead progress reporter for Dual Scrubber (every 1 second)
  useEffect(() => {
    if (!socket || !socket.connected) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      const currentTime = player.getCurrentTime();
      const duration = player.getDuration();
      socket.emit("media:progress_report" as any, {
        currentTime,
        duration,
        isStalled: false,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [socket]);

  // Handle outgoing chat message
  const handleSendMessage = useCallback(
    (text: string) => {
      if (!socket || !socket.connected || !text.trim()) return;
      socket.emit("chat:send", {
        roomCode,
        text: text.trim(),
      });
    },
    [socket, roomCode]
  );

  // Handle outgoing emoji reaction
  const handleSendReaction = useCallback(
    (emoji: string) => {
      if (!socket || !socket.connected) return;
      socket.emit("reaction:send", {
        roomCode,
        emoji,
      });
    },
    [socket, roomCode]
  );

  // Handle media source swap
  const handleChangeMedia = useCallback(
    (newUrl: string, newType: MediaType, title?: string) => {
      if (!canControl) return;
      setRoomDetails((prev) => ({ ...prev, mediaUrl: newUrl, mediaType: newType }));
      if (socket && socket.connected) {
        socket.emit("room:change_media", { roomCode, mediaUrl: newUrl, mediaType: newType });
      }
    },
    [socket, roomCode, canControl]
  );

  // Handle queue actions
  const handleAddToQueue = useCallback(
    (item: Omit<QueueItemDTO, "id" | "createdAt">) => {
      const fullItem: QueueItemDTO = {
        ...item,
        id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        createdAt: Date.now(),
      };
      setQueue((prev) => [...prev, fullItem]);
      socket?.emit("queue:add" as any, { item: fullItem });
    },
    [socket]
  );

  const handleRemoveFromQueue = useCallback(
    (itemId: string) => {
      setQueue((prev) => prev.filter((i) => i.id !== itemId));
      socket?.emit("queue:remove" as any, { itemId });
    },
    [socket]
  );

  // Handle Local File Selection (ObjectURL without uploading)
  const handleSelectLocalFile = useCallback(
    (file: File) => {
      const blobUrl = URL.createObjectURL(file);
      handleChangeMedia(blobUrl, "LOCAL_FILE", file.name);
    },
    [handleChangeMedia]
  );

  // Handle permission toggle (Host only)
  const handleTogglePermission = useCallback(
    (newMode: PermissionMode) => {
      if (!isHost) return;
      setRoomDetails((prev) => ({ ...prev, permissionMode: newMode }));
      if (socket && socket.connected) {
        socket.emit("room:set_permission", { roomCode, permissionMode: newMode });
      }
    },
    [socket, roomCode, isHost]
  );

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Top Room Navigation Bar */}
      <RoomHeader
        roomCode={roomCode}
        roomName={roomDetails.name}
        isHost={isHost}
        permissionMode={roomDetails.permissionMode}
        onTogglePermission={handleTogglePermission}
        syncStatus={syncStatus}
        activeUsers={activeUsers}
        isVoiceActive={isVoiceActive}
        isVoiceMuted={isVoiceMuted}
        isSpeaking={isSpeaking}
        isPartnerSpeaking={isPartnerSpeaking}
        onToggleVoice={() => (isVoiceActive ? stopVoice() : startVoice())}
        onToggleVoiceMute={toggleVoiceMute}
      />

      {/* Permission Denied Banner if applicable */}
      {errorMessage && (
        <div className="bg-red-500/20 border-b border-red-500/30 px-4 py-2 text-center text-xs font-semibold text-red-300 flex items-center justify-center gap-2 animate-in fade-in-0">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Responsive 2-Column Layout */}
      <main className="flex-1 container max-w-7xl mx-auto px-2 sm:px-4 py-4 grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-3.5rem)] min-h-[600px]">
        {/* Left Column (70% on Desktop): Unified Video Theater */}
        <section className="lg:col-span-8 flex flex-col justify-center relative">
          <div className="relative w-full overflow-hidden rounded-2xl">
            {/* Unified Video Player with DualScrubber, Subtitles, and Audio Ducking */}
            <VideoPlayer
              ref={playerRef}
              mediaUrl={roomDetails.mediaUrl}
              mediaType={roomDetails.mediaType}
              title={roomDetails.name}
              canControl={canControl}
              disabledReason="Playback controls are locked to Room Host."
              partnerProgress={partnerProgress}
              isDucked={isPartnerSpeaking}
              onPlay={(time) => emitPlay(time)}
              onPause={(time) => emitPause(time)}
              onSeek={(time) => emitSeek(time)}
              onSnapSync={snapToAuthoritativeTime}
              onSendReaction={handleSendReaction}
              onChangeMedia={handleChangeMedia}
              className="w-full"
            />

            {/* Floating Emoji Particle Reaction Canvas */}
            <EmojiReactionCanvas bursts={reactionBursts} />
          </div>
        </section>

        {/* Right Column (30% on Desktop): Sidebar (Chat, The Shelf, Participants) */}
        <aside className="lg:col-span-4 flex flex-col h-full min-h-[420px] max-h-[750px]">
          <Tabs
            value={activeSidebarTab}
            onValueChange={setActiveSidebarTab}
            className="flex flex-col h-full"
          >
            <TabsList className="grid grid-cols-3 mb-2 bg-slate-900 border border-slate-800">
              <TabsTrigger value="chat" className="gap-1.5 text-xs">
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Chat</span>
              </TabsTrigger>
              <TabsTrigger value="shelf" className="gap-1.5 text-xs">
                <ListVideo className="h-3.5 w-3.5" />
                <span>Shelf {queue.length > 0 && `(${queue.length})`}</span>
              </TabsTrigger>
              <TabsTrigger value="participants" className="gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5" />
                <span>Members ({activeUsers.length})</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="flex-1 min-h-0 mt-0">
              <ChatPanel
                messages={messages}
                currentUser={currentUser}
                onSendMessage={handleSendMessage}
                onSendReaction={handleSendReaction}
                className="h-full"
              />
            </TabsContent>

            <TabsContent value="shelf" className="flex-1 min-h-0 mt-0 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              <MediaShelf
                queue={queue}
                currentMediaUrl={roomDetails.mediaUrl}
                canControl={canControl}
                onAddToQueue={handleAddToQueue}
                onRemoveFromQueue={handleRemoveFromQueue}
                onSwitchMedia={handleChangeMedia}
                onSelectLocalFile={handleSelectLocalFile}
              />
            </TabsContent>

            <TabsContent value="participants" className="flex-1 min-h-0 mt-0 overflow-y-auto bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl p-2 shadow-2xl">
              <ParticipantsList
                users={activeUsers}
                currentUserId={currentUser.id}
                hostId={roomDetails.hostId}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </main>
    </div>
  );
}
