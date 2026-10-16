import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { describeHttpError } from '../../core/http-error';
import { BtnDirective } from '../../shared/btn.directive';

type State = 'checking' | 'done' | 'failed';

@Component({
  selector: 'app-verify-email-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BtnDirective],
  styleUrl: './auth-card.scss',
  template: `
    @switch (state()) {
      @case ('checking') {
        <section class="card box">
          <span class="emoji" aria-hidden="true">⏳</span>
          <h1>Confirmando seu e-mail…</h1>
          <p>Só um instante.</p>
        </section>
      }
      @case ('done') {
        <section class="card box" style="--accent: var(--lime)">
          <span class="emoji" aria-hidden="true">🎉</span>
          <h1>E-mail confirmado!</h1>
          <p>Pronto. Agora você pode criar salas, conversar e entrar nas chamadas de voz e vídeo.</p>
          <a appBtn="lime" size="lg" [routerLink]="auth.isAuthenticated() ? '/salas' : '/entrar'">
            {{ auth.isAuthenticated() ? 'Ir para as salas' : 'Entrar na minha conta' }}
          </a>
        </section>
      }
      @case ('failed') {
        <section class="card box" style="--accent: var(--pink)">
          <span class="emoji" aria-hidden="true">🫠</span>
          <h1>Esse link não funcionou</h1>
          <p>{{ message() }}</p>
          <div class="actions">
            @if (auth.isAuthenticated()) {
              <button appBtn="pink" type="button" [disabled]="resending()" (click)="resend()">
                {{ resending() ? 'Enviando…' : 'Enviar novo link' }}
              </button>
            } @else {
              <a appBtn="pink" routerLink="/entrar">Entrar para pedir outro</a>
            }
          </div>
        </section>
      }
    }
  `,
})
export class VerifyEmailPage implements OnInit {
  /** Vem da query string do link: /confirmar-email?token=... */
  readonly token = input('');

  protected readonly auth = inject(AuthService);
  protected readonly state = signal<State>('checking');
  protected readonly message = signal('');
  protected readonly resending = signal(false);

  ngOnInit(): void {
    if (!this.token()) {
      this.fail('O link está incompleto. Abra-o exatamente como chegou no seu e-mail.');
      return;
    }
    this.auth.verifyEmail(this.token()).subscribe({
      next: () => this.state.set('done'),
      error: (error: unknown) => this.fail(describeHttpError(error, 'Este link é inválido ou expirou.')),
    });
  }

  protected resend(): void {
    this.resending.set(true);
    this.auth.resendVerification().subscribe({
      next: (response) => {
        this.resending.set(false);
        this.message.set(response.detail);
      },
      error: (error: unknown) => {
        this.resending.set(false);
        this.message.set(describeHttpError(error));
      },
    });
  }

  private fail(message: string): void {
    this.message.set(message);
    this.state.set('failed');
  }
}
