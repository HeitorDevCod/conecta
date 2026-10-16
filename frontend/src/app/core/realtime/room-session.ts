import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';

import { RoomsApi } from '../api/rooms-api';
import { describeHttpError } from '../http-error';
import { ChatMessage, Peer, PeerId, Room, ServerEvent } from '../models';
import { ToastService } from '../toast.service';
import { CallService } from './call.service';
import { RoomSocket } from './room-socket';

const TYPING_TTL_MS = 3500;

/** crypto.randomUUID só existe em contexto seguro (HTTPS/localhost). */
function makeClientId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Estado de uma sala aberta: mensagens, presença e digitação. */
@Injectable()
export class RoomSession {
  private readonly api = inject(RoomsApi);
  private readonly socket = inject(RoomSocket);
  private readonly call = inject(CallService);
  private readonly toast = inject(ToastService);

  private readonly typingTimers = new Map<PeerId, ReturnType<typeof setTimeout>>();
  private sessionCount = 0;

  readonly room = signal<Room | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly messages = signal<readonly ChatMessage[]>([]);
  readonly hasMore = signal(false);
  readonly loadingMore = signal(false);
  readonly selfPeerId = signal<PeerId | null>(null);
  readonly peers = signal<ReadonlyMap<PeerId, Peer>>(new Map());
  readonly typing = signal<ReadonlyMap<PeerId, string>>(new Map());

  readonly status = this.socket.status;

  /** Pessoas únicas online (um usuário pode ter várias abas). */
  readonly onlineUsers = computed(() => {
    const byUser = new Map<number, Peer>();
    for (const peer of this.peers().values()) {
      if (!byUser.has(peer.userId) || peer.inCall) {
        byUser.set(peer.userId, peer);
      }
    }
    return [...byUser.values()];
  });

  readonly callPeers = computed(() =>
    [...this.peers().values()].filter((peer) => peer.inCall && peer.peerId !== this.selfPeerId()),
  );

  readonly typingLabel = computed(() => {
    const names = [...this.typing().values()];
    if (names.length === 0) return '';
    if (names.length === 1) return `${names[0]} está digitando…`;
    if (names.length === 2) return `${names[0]} e ${names[1]} estão digitando…`;
    return 'Várias pessoas estão digitando…';
  });

  constructor() {
    this.socket.events$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((event) => this.dispatch(event));
  }

  async open(slug: string): Promise<void> {
    try {
      let room = await firstValueFrom(this.api.get(slug));
      if (!room.isMember) {
        room = await firstValueFrom(this.api.join(slug));
      }
      this.room.set(room);
      const page = await firstValueFrom(this.api.messages(slug));
      this.messages.set(page.results);
      this.hasMore.set(page.hasMore);
      this.socket.connect(slug);
    } catch (error: unknown) {
      this.loadError.set(describeHttpError(error, 'Não foi possível abrir esta sala.'));
    }
  }

  async loadOlder(): Promise<void> {
    const room = this.room();
    const oldest = this.messages()[0];
    if (!room || !oldest || this.loadingMore()) {
      return;
    }
    this.loadingMore.set(true);
    try {
      const page = await firstValueFrom(this.api.messages(room.slug, oldest.createdAt));
      this.messages.update((current) => [...page.results, ...current]);
      this.hasMore.set(page.hasMore);
    } finally {
      this.loadingMore.set(false);
    }
  }

  sendMessage(content: string): boolean {
    return this.socket.send({ type: 'chat.message', content, clientId: makeClientId() });
  }

  setTyping(isTyping: boolean): void {
    this.socket.send({ type: 'chat.typing', isTyping });
  }

  private dispatch(event: ServerEvent): void {
    switch (event.type) {
      case 'session.ready':
        this.onSessionReady(event.peerId, event.peers);
        break;
      case 'presence.joined':
      case 'call.joined':
        this.upsertPeer(event.peer);
        break;
      case 'presence.left':
        this.removePeer(event.peerId);
        break;
      case 'call.left':
        this.patchPeer(event.peerId, { inCall: false });
        this.call.handleEvent(event);
        break;
      case 'call.media':
        this.patchPeer(event.peerId, { media: event.media });
        break;
      case 'chat.message':
        this.messages.update((current) =>
          current.some((message) => message.id === event.message.id) ? current : [...current, event.message],
        );
        this.clearTyping(this.peerOfUser(event.message.author?.id));
        break;
      case 'chat.typing':
        if (event.peerId !== this.selfPeerId()) {
          this.onTyping(event.peerId, event.displayName, event.isTyping);
        }
        break;
      case 'error':
        this.toast.show(event.detail, 'error');
        break;
      default:
        this.call.handleEvent(event);
    }
  }

  private onSessionReady(peerId: PeerId, peers: readonly Peer[]): void {
    this.sessionCount += 1;
    if (this.sessionCount > 1) {
      // reconexão: a chamada anterior não sobrevive à troca de peerId
      this.call.teardown();
      this.toast.show('Conexão restabelecida.', 'success');
    }
    this.selfPeerId.set(peerId);
    this.call.setSelf(peerId);
    this.peers.set(new Map(peers.map((peer) => [peer.peerId, peer])));
  }

  private upsertPeer(peer: Peer): void {
    this.peers.update((current) => new Map(current).set(peer.peerId, peer));
  }

  private patchPeer(peerId: PeerId, patch: Partial<Pick<Peer, 'inCall' | 'media'>>): void {
    const peer = this.peers().get(peerId);
    if (peer) {
      this.upsertPeer({ ...peer, ...patch });
    }
  }

  private removePeer(peerId: PeerId): void {
    this.peers.update((current) => {
      const next = new Map(current);
      next.delete(peerId);
      return next;
    });
    this.clearTyping(peerId);
  }

  private peerOfUser(userId: number | undefined): PeerId | undefined {
    return [...this.typing().keys()].find((peerId) => this.peers().get(peerId)?.userId === userId);
  }

  private onTyping(peerId: PeerId, name: string, isTyping: boolean): void {
    if (!isTyping) {
      this.clearTyping(peerId);
      return;
    }
    this.typing.update((current) => new Map(current).set(peerId, name));
    const timer = this.typingTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
    }
    this.typingTimers.set(
      peerId,
      setTimeout(() => this.clearTyping(peerId), TYPING_TTL_MS),
    );
  }

  private clearTyping(peerId: PeerId | undefined): void {
    if (!peerId || !this.typing().has(peerId)) {
      return;
    }
    this.typing.update((current) => {
      const next = new Map(current);
      next.delete(peerId);
      return next;
    });
  }
}
