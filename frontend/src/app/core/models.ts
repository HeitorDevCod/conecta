/* Tipos do domínio e do protocolo de tempo real.
 * Mantidos em sincronia com apps/chat/consumers.py no backend. */

export interface User {
  readonly id: number;
  readonly email: string;
  readonly displayName: string;
  readonly avatarColor: string;
}

export interface AuthTokens {
  readonly access: string;
  readonly refresh: string;
}

export interface AuthResponse extends AuthTokens {
  readonly user: User;
}

export interface LoginPayload {
  readonly email: string;
  readonly password: string;
}

export interface RegisterPayload extends LoginPayload {
  readonly displayName: string;
}

export interface Room {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly color: string;
  readonly createdAt: string;
  readonly memberCount: number;
  readonly isMember: boolean;
}

export interface CreateRoomPayload {
  readonly name: string;
  readonly description: string;
  readonly color: string;
}

export type MessageKind = 'text' | 'system';

export interface ChatMessage {
  readonly id: string;
  readonly roomSlug: string;
  readonly author: User | null;
  readonly kind: MessageKind;
  readonly content: string;
  readonly createdAt: string;
}

export interface MessagePage {
  readonly results: readonly ChatMessage[];
  readonly hasMore: boolean;
}

export interface RtcConfig {
  readonly iceServers: RTCIceServer[];
  readonly maxParticipants: number;
}

export interface MediaState {
  readonly audio: boolean;
  readonly video: boolean;
}

export type PeerId = string & { readonly __brand: 'PeerId' };

export interface Peer {
  readonly peerId: PeerId;
  readonly userId: number;
  readonly displayName: string;
  readonly avatarColor: string;
  readonly inCall: boolean;
  readonly media: MediaState;
}

export const REACTIONS = ['🔥', '👏', '😂', '❤️', '🚀', '🎉', '👍', '🤯'] as const;
export type Reaction = (typeof REACTIONS)[number];

export interface SessionDescription {
  readonly type: 'offer' | 'answer';
  readonly sdp: string;
}

/* ---------------------------------------------------------- cliente → servidor */

export type ClientEvent =
  | { readonly type: 'chat.message'; readonly content: string; readonly clientId: string }
  | { readonly type: 'chat.typing'; readonly isTyping: boolean }
  | { readonly type: 'call.join'; readonly media: MediaState }
  | { readonly type: 'call.leave' }
  | { readonly type: 'call.media'; readonly media: MediaState }
  | { readonly type: 'call.reaction'; readonly emoji: Reaction }
  | { readonly type: 'call.caption'; readonly text: string; readonly final: boolean }
  | { readonly type: 'rtc.offer'; readonly to: PeerId; readonly sdp: SessionDescription }
  | { readonly type: 'rtc.answer'; readonly to: PeerId; readonly sdp: SessionDescription }
  | { readonly type: 'rtc.ice'; readonly to: PeerId; readonly candidate: RTCIceCandidateInit };

/* ---------------------------------------------------------- servidor → cliente */

export type ServerEvent =
  | { readonly type: 'session.ready'; readonly peerId: PeerId; readonly peers: readonly Peer[] }
  | { readonly type: 'presence.joined'; readonly peer: Peer }
  | { readonly type: 'presence.left'; readonly peerId: PeerId }
  | { readonly type: 'chat.message'; readonly message: ChatMessage; readonly clientId: string | null }
  | {
      readonly type: 'chat.typing';
      readonly peerId: PeerId;
      readonly displayName: string;
      readonly isTyping: boolean;
    }
  | { readonly type: 'call.accepted'; readonly participants: readonly Peer[] }
  | { readonly type: 'call.joined'; readonly peer: Peer }
  | { readonly type: 'call.left'; readonly peerId: PeerId }
  | { readonly type: 'call.media'; readonly peerId: PeerId; readonly media: MediaState }
  | { readonly type: 'call.reaction'; readonly peerId: PeerId; readonly emoji: Reaction }
  | {
      readonly type: 'call.caption';
      readonly peerId: PeerId;
      readonly displayName: string;
      readonly text: string;
      readonly final: boolean;
    }
  | { readonly type: 'rtc.offer'; readonly from: PeerId; readonly sdp: SessionDescription }
  | { readonly type: 'rtc.answer'; readonly from: PeerId; readonly sdp: SessionDescription }
  | { readonly type: 'rtc.ice'; readonly from: PeerId; readonly candidate: RTCIceCandidateInit }
  | { readonly type: 'error'; readonly code: string; readonly detail: string };

export type ServerEventOf<T extends ServerEvent['type']> = Extract<ServerEvent, { type: T }>;

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';
