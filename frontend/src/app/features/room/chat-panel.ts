import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';

import { AuthService } from '../../core/auth/auth.service';
import { ChatMessage } from '../../core/models';
import { RoomSession } from '../../core/realtime/room-session';
import { AvatarComponent } from '../../shared/avatar.component';
import { BtnDirective } from '../../shared/btn.directive';
import { IconComponent } from '../../shared/icon.component';

interface MessageGroup {
  readonly key: string;
  readonly mine: boolean;
  readonly authorName: string;
  readonly authorColor: string;
  readonly messages: readonly ChatMessage[];
}

const GROUP_WINDOW_MS = 4 * 60 * 1000;
const TYPING_IDLE_MS = 2500;

@Component({
  selector: 'app-chat-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, AvatarComponent, BtnDirective, IconComponent],
  templateUrl: './chat-panel.html',
  styleUrl: './chat-panel.scss',
})
export class ChatPanel {
  protected readonly session = inject(RoomSession);
  private readonly auth = inject(AuthService);

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private stickToBottom = true;

  protected readonly draft = signal('');
  protected readonly canSend = computed(() => this.draft().trim().length > 0 && this.session.status() === 'open');

  /** Agrupa mensagens consecutivas do mesmo autor, como nos mensageiros modernos. */
  protected readonly groups = computed<readonly MessageGroup[]>(() => {
    const me = this.auth.user()?.id;
    const groups: { key: string; mine: boolean; authorName: string; authorColor: string; messages: ChatMessage[] }[] =
      [];
    for (const message of this.session.messages()) {
      const last = groups.at(-1);
      const lastMessage = last?.messages.at(-1);
      const sameAuthor = lastMessage?.author?.id === message.author?.id;
      const closeInTime =
        lastMessage !== undefined &&
        new Date(message.createdAt).getTime() - new Date(lastMessage.createdAt).getTime() < GROUP_WINDOW_MS;
      if (last && sameAuthor && closeInTime) {
        last.messages.push(message);
      } else {
        groups.push({
          key: message.id,
          mine: message.author?.id === me,
          authorName: message.author?.displayName ?? 'Conta removida',
          authorColor: message.author?.avatarColor ?? '#565d69',
          messages: [message],
        });
      }
    }
    return groups;
  });

  constructor() {
    afterRenderEffect(() => {
      this.groups();
      const element = this.scroller().nativeElement;
      if (this.stickToBottom) {
        element.scrollTop = element.scrollHeight;
      }
    });
  }

  protected onScroll(): void {
    const element = this.scroller().nativeElement;
    this.stickToBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }

  protected onInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.draft.set(textarea.value);
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;

    if (!this.typingTimer) {
      this.session.setTyping(true);
    } else {
      clearTimeout(this.typingTimer);
    }
    this.typingTimer = setTimeout(() => {
      this.session.setTyping(false);
      this.typingTimer = null;
    }, TYPING_IDLE_MS);
  }

  protected onKeydown(event: KeyboardEvent, textarea: HTMLTextAreaElement): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.send(textarea);
    }
  }

  protected send(textarea: HTMLTextAreaElement): void {
    const content = this.draft().trim();
    if (!content || !this.session.sendMessage(content)) {
      return;
    }
    this.stickToBottom = true;
    this.draft.set('');
    textarea.value = '';
    textarea.style.height = 'auto';
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
    this.session.setTyping(false);
    textarea.focus();
  }
}
