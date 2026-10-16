import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { ConnectionStatus, REACTIONS, Reaction } from '../../core/models';
import { CallService, LOCAL_KEY } from '../../core/realtime/call.service';
import { RoomSession } from '../../core/realtime/room-session';
import { RoomSocket } from '../../core/realtime/room-socket';
import { AvatarComponent } from '../../shared/avatar.component';
import { BtnDirective } from '../../shared/btn.directive';
import { IconComponent } from '../../shared/icon.component';
import { ChatPanel } from './chat-panel';
import { VideoTile } from './video-tile';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: 'Preparando',
  connecting: 'Conectando',
  open: 'Ao vivo',
  reconnecting: 'Reconectando',
  closed: 'Desconectado',
};

@Component({
  selector: 'app-room-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AvatarComponent, BtnDirective, IconComponent, ChatPanel, VideoTile],
  providers: [RoomSocket, CallService, RoomSession],
  templateUrl: './room-page.html',
  styleUrl: './room-page.scss',
})
export class RoomPage implements OnInit {
  /** Vem da rota (withComponentInputBinding). */
  readonly slug = input.required<string>();

  protected readonly session = inject(RoomSession);
  protected readonly call = inject(CallService);
  protected readonly user = inject(AuthService).user;

  protected readonly reactions = REACTIONS;
  protected readonly localKey = LOCAL_KEY;
  protected readonly pickerOpen = signal(false);
  protected readonly mobileTab = signal<'call' | 'chat'>('call');

  protected readonly statusLabel = computed(() => STATUS_LABEL[this.session.status()]);

  protected readonly tiles = computed(() => {
    const streams = this.call.remoteStreams();
    const speaking = this.call.speaking();
    return this.session.callPeers().map((peer) => ({
      peer,
      stream: streams.get(peer.peerId) ?? null,
      speaking: speaking.has(peer.peerId),
    }));
  });

  protected readonly gridClass = computed(() => `grid grid--${Math.min(this.tiles().length + 1, 6)}`);

  protected readonly captionList = computed(() => [...this.call.captions().values()]);

  ngOnInit(): void {
    void this.session.open(this.slug());
  }

  protected sendReaction(emoji: Reaction): void {
    this.call.react(emoji);
  }
}
