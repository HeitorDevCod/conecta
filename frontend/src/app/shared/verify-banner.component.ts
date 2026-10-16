import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { AuthService } from '../core/auth/auth.service';
import { describeHttpError } from '../core/http-error';
import { ToastService } from '../core/toast.service';
import { BtnDirective } from './btn.directive';

/** Aviso para quem ainda não confirmou o e-mail. Some sozinho depois da confirmação. */
@Component({
  selector: 'app-verify-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BtnDirective],
  template: `
    @if (auth.user(); as user) {
      @if (!user.emailVerified) {
        <aside class="banner" role="status">
          <span class="icon" aria-hidden="true">✉️</span>
          <div class="text">
            <strong>Confirme seu e-mail para começar a conversar.</strong>
            <span>Enviamos um link para {{ user.email }}. Até lá, você pode explorar as salas.</span>
          </div>
          <div class="actions">
            <button appBtn="ghost" size="sm" type="button" [disabled]="checking()" (click)="check()">
              {{ checking() ? 'Verificando…' : 'Já confirmei' }}
            </button>
            <button appBtn="orange" size="sm" type="button" [disabled]="sending()" (click)="resend()">
              {{ sending() ? 'Enviando…' : 'Reenviar e-mail' }}
            </button>
          </div>
        </aside>
      }
    }
  `,
  styles: `
    .banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 14px 18px;
      padding: 14px 18px;
      border-radius: var(--radius-lg);
      background: var(--surface);
      border: 1px solid var(--line);
      box-shadow: inset 3px 0 0 var(--orange);
      animation: pop-in 0.3s ease-out;
    }
    .icon {
      display: grid;
      place-items: center;
      inline-size: 40px;
      block-size: 40px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--orange) 15%, transparent);
      font-size: 20px;
    }
    .text {
      flex: 1 1 260px;
      display: grid;
      gap: 2px;
      min-inline-size: 0;
      span { color: var(--muted); overflow-wrap: anywhere; }
    }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
  `,
})
export class VerifyBannerComponent {
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly sending = signal(false);
  protected readonly checking = signal(false);

  protected resend(): void {
    this.sending.set(true);
    this.auth.resendVerification().subscribe({
      next: (response) => {
        this.sending.set(false);
        this.toast.show(response.detail, 'success');
      },
      error: (error: unknown) => {
        this.sending.set(false);
        this.toast.show(describeHttpError(error), 'error');
      },
    });
  }

  protected check(): void {
    this.checking.set(true);
    this.auth.reloadUser().subscribe({
      next: (user) => {
        this.checking.set(false);
        this.toast.show(
          user.emailVerified ? 'E-mail confirmado. Bem-vindo!' : 'Ainda não recebemos a confirmação. Abra o link do e-mail.',
          user.emailVerified ? 'success' : 'info',
        );
      },
      error: () => this.checking.set(false),
    });
  }
}
