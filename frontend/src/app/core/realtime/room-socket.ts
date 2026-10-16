import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Observable, Subject, firstValueFrom } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { ClientEvent, ConnectionStatus, ServerEvent } from '../models';

const CLOSE_UNAUTHORIZED = 4401;
const FATAL_CLOSE_CODES = new Set([4403, 4404]);
const MAX_BACKOFF_MS = 10_000;

function socketUrl(slug: string, token: string): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws/rooms/${encodeURIComponent(slug)}/?token=${encodeURIComponent(token)}`;
}

function isServerEvent(value: unknown): value is ServerEvent {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

/**
 * Conexão WebSocket de uma sala. Instanciado por componente (providers),
 * fecha sozinho quando o componente é destruído.
 */
@Injectable()
export class RoomSocket {
  private readonly auth = inject(AuthService);

  private socket: WebSocket | null = null;
  private slug = '';
  private attempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;

  private readonly eventsSubject = new Subject<ServerEvent>();
  private readonly statusState = signal<ConnectionStatus>('idle');

  readonly events$: Observable<ServerEvent> = this.eventsSubject.asObservable();
  readonly status = this.statusState.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.close());
  }

  connect(slug: string): void {
    this.slug = slug;
    this.manuallyClosed = false;
    this.open();
  }

  send(event: ClientEvent): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(event));
    return true;
  }

  close(): void {
    this.manuallyClosed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    this.socket?.close(1000);
    this.socket = null;
    this.statusState.set('closed');
    this.eventsSubject.complete();
  }

  private open(): void {
    const token = this.auth.accessToken;
    if (!token) {
      this.auth.logout();
      return;
    }
    this.statusState.set(this.attempts === 0 ? 'connecting' : 'reconnecting');

    const socket = new WebSocket(socketUrl(this.slug, token));
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.statusState.set('open');
    };

    socket.onmessage = (message: MessageEvent<string>) => {
      try {
        const parsed: unknown = JSON.parse(message.data);
        if (isServerEvent(parsed)) {
          this.eventsSubject.next(parsed);
        }
      } catch {
        console.warn('Evento ignorado: JSON inválido');
      }
    };

    socket.onclose = (event: CloseEvent) => {
      if (this.socket !== socket || this.manuallyClosed) {
        return;
      }
      this.socket = null;
      if (FATAL_CLOSE_CODES.has(event.code)) {
        this.statusState.set('closed');
        return;
      }
      void this.scheduleReconnect(event.code === CLOSE_UNAUTHORIZED);
    };
  }

  private async scheduleReconnect(needsFreshToken: boolean): Promise<void> {
    this.statusState.set('reconnecting');
    if (needsFreshToken) {
      const token = await firstValueFrom(this.auth.refreshAccessToken());
      if (!token) {
        return;
      }
    }
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempts) + Math.random() * 300;
    this.attempts += 1;
    this.retryTimer = setTimeout(() => this.open(), delay);
  }
}
