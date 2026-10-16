import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { describeHttpError } from '../../core/http-error';
import { BtnDirective } from '../../shared/btn.directive';

@Component({
  selector: 'app-forgot-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, BtnDirective],
  styleUrl: './auth-card.scss',
  template: `
    <section class="card box" style="--accent: var(--pink)">
      @if (sentTo(); as email) {
        <span class="emoji" aria-hidden="true">📬</span>
        <h1>Confira sua caixa de entrada</h1>
        <p>
          Se existir uma conta com <strong>{{ email }}</strong>, enviamos um link para criar uma nova senha.
          Ele vale por 2 horas. Olhe também o spam.
        </p>
        <div class="actions">
          <a appBtn="cyan" routerLink="/entrar">Voltar para o login</a>
          <button type="button" appBtn="ghost" size="sm" [confetti]="false" (click)="sentTo.set(null)">
            Usar outro e-mail
          </button>
        </div>
      } @else {
        <span class="emoji" aria-hidden="true">🔑</span>
        <h1>Esqueceu a senha?</h1>
        <p>Digite o e-mail da sua conta e mandamos um link para você criar uma nova.</p>
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <label class="field">
            <span>E-mail</span>
            <input class="input" type="email" formControlName="email" autocomplete="email" placeholder="voce@email.com" />
          </label>
          @if (error(); as message) {
            <p class="error" role="alert">{{ message }}</p>
          }
          <button appBtn="pink" size="lg" type="submit" [disabled]="busy()">
            {{ busy() ? 'Enviando…' : 'Enviar link' }}
          </button>
        </form>
        <a class="link" routerLink="/entrar">← Lembrei a senha</a>
      }
    </section>
  `,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sentTo = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected submit(): void {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      this.error.set(this.form.invalid ? 'Digite um e-mail válido.' : null);
      return;
    }
    const { email } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.auth.requestPasswordReset(email).subscribe({
      next: () => {
        this.busy.set(false);
        this.sentTo.set(email);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(describeHttpError(error));
      },
    });
  }
}
