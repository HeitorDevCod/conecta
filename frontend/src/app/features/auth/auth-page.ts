import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { describeHttpError } from '../../core/http-error';
import { User } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { BtnDirective } from '../../shared/btn.directive';
import { IconComponent } from '../../shared/icon.component';

type Mode = 'login' | 'register';

@Component({
  selector: 'app-auth-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, BtnDirective, IconComponent],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.scss',
})
export class AuthPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly mode = signal<Mode>('login');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly isRegister = computed(() => this.mode() === 'register');

  protected readonly form = this.fb.group({
    displayName: ['', [Validators.minLength(2), Validators.maxLength(40)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly features = [
    { icon: 'chat', label: 'Chat em tempo real', color: 'var(--pink)' },
    { icon: 'mic', label: 'Voz cristalina', color: 'var(--cyan)' },
    { icon: 'cam', label: 'Vídeo em grupo', color: 'var(--lime)' },
    { icon: 'captions', label: 'Legendas ao vivo', color: 'var(--yellow)' },
  ] as const;

  protected switchMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set(null);
    const displayName = this.form.controls.displayName;
    displayName.setValidators(
      mode === 'register'
        ? [Validators.required, Validators.minLength(2), Validators.maxLength(40)]
        : [Validators.minLength(2), Validators.maxLength(40)],
    );
    displayName.updateValueAndValidity();
  }

  protected submit(): void {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    const { displayName, email, password } = this.form.getRawValue();
    const request$: Observable<User> = this.isRegister()
      ? this.auth.register({ displayName, email, password })
      : this.auth.login({ email, password });

    this.busy.set(true);
    this.error.set(null);
    request$.subscribe({
      next: (user) => {
        if (!user.emailVerified) {
          this.toast.show(`Enviamos um link de confirmação para ${user.email}.`, 'success', 6000);
        }
        void this.router.navigate(['/salas']);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(
          describeHttpError(error, this.isRegister() ? 'Não foi possível criar a conta.' : 'E-mail ou senha incorretos.'),
        );
      },
    });
  }
}
