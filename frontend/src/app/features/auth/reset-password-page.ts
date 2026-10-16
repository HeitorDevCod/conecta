import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { describeHttpError } from '../../core/http-error';
import { ToastService } from '../../core/toast.service';
import { BtnDirective } from '../../shared/btn.directive';

const STRENGTH_COLORS = ['var(--line)', 'var(--pink)', 'var(--orange)', 'var(--yellow)', 'var(--lime)'] as const;
const STRENGTH_LABELS = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'] as const;

/** Estimativa simples, só para orientar. A validação real fica no servidor. */
function passwordScore(value: string): number {
  if (!value) return 0;
  let score = value.length >= 8 ? 1 : 0;
  if (value.length >= 12) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.max(1, Math.min(score, 4));
}

@Component({
  selector: 'app-reset-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, BtnDirective],
  styleUrl: './auth-card.scss',
  template: `
    <section class="card box" style="--accent-card: var(--lime)">
      <span class="emoji" aria-hidden="true">🔐</span>
      @if (!hasLink()) {
        <h1>Link incompleto</h1>
        <p>Abra o link exatamente como chegou no seu e-mail ou peça um novo.</p>
        <a appBtn="orange" routerLink="/esqueci-senha">Pedir novo link</a>
      } @else {
        <h1>Crie uma nova senha</h1>
        <p>Use pelo menos 8 caracteres. Misturar letras, números e símbolos deixa tudo mais seguro.</p>
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <label class="field">
            <span>Nova senha</span>
            <input class="input" type="password" formControlName="password" autocomplete="new-password" />
          </label>
          <div class="meter" aria-hidden="true">
            @for (step of [1, 2, 3, 4]; track step) {
              <span [style.background]="step <= score() ? strengthColor() : null"></span>
            }
          </div>
          @if (score() > 0) {
            <p class="hint">Força: {{ strengthLabel() }}</p>
          }
          <label class="field">
            <span>Repita a senha</span>
            <input class="input" type="password" formControlName="confirm" autocomplete="new-password" />
          </label>
          @if (error(); as message) {
            <p class="error" role="alert">{{ message }}</p>
          }
          <button appBtn="lime" size="lg" type="submit" [disabled]="busy()">
            {{ busy() ? 'Salvando…' : 'Salvar nova senha' }}
          </button>
        </form>
        @if (expired()) {
          <a class="link" routerLink="/esqueci-senha">Pedir um novo link →</a>
        }
      }
    </section>
  `,
})
export class ResetPasswordPage {
  /** Vêm da query string do link: /redefinir-senha?uid=...&token=... */
  readonly uid = input('');
  readonly token = input('');

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly expired = signal(false);
  protected readonly hasLink = computed(() => this.uid().length > 0 && this.token().length > 0);

  protected readonly form = inject(NonNullableFormBuilder).group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', Validators.required],
  });

  private readonly password = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });
  protected readonly score = computed(() => passwordScore(this.password()));
  protected readonly strengthColor = computed(() => STRENGTH_COLORS[this.score()] ?? STRENGTH_COLORS[0]);
  protected readonly strengthLabel = computed(() => STRENGTH_LABELS[this.score()] ?? '');

  protected submit(): void {
    const { password, confirm } = this.form.getRawValue();
    if (password.length < 8) {
      this.error.set('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      this.error.set('As duas senhas não são iguais.');
      return;
    }
    if (this.busy()) return;

    this.busy.set(true);
    this.error.set(null);
    this.auth.confirmPasswordReset({ uid: this.uid(), token: this.token(), password }).subscribe({
      next: (response) => {
        this.toast.show(response.detail, 'success');
        void this.router.navigate(['/entrar']);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        const message = describeHttpError(error, 'Não foi possível salvar a nova senha.');
        this.expired.set(message.includes('expirou'));
        this.error.set(message);
      },
    });
  }
}
