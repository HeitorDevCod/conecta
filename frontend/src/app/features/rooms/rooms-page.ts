import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { RoomsApi } from '../../core/api/rooms-api';
import { AuthService } from '../../core/auth/auth.service';
import { describeHttpError } from '../../core/http-error';
import { Room } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { BtnDirective } from '../../shared/btn.directive';
import { IconComponent } from '../../shared/icon.component';

export const ROOM_COLORS = ['#ff2e88', '#00e5ff', '#b6ff00', '#ff8a00', '#8b5cf6', '#ffd60a'] as const;

@Component({
  selector: 'app-rooms-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AvatarComponent, BtnDirective, IconComponent],
  templateUrl: './rooms-page.html',
  styleUrl: './rooms-page.scss',
})
export class RoomsPage {
  private readonly api = inject(RoomsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);

  protected readonly colors = ROOM_COLORS;
  protected readonly rooms = signal<readonly Room[]>([]);
  protected readonly loading = signal(true);
  protected readonly creating = signal(false);
  protected readonly query = signal('');

  protected readonly filtered = computed(() => {
    const term = this.query().trim().toLowerCase();
    return term
      ? this.rooms().filter((room) => `${room.name} ${room.description}`.toLowerCase().includes(term))
      : this.rooms();
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(60)]],
    description: ['', Validators.maxLength(200)],
    color: [ROOM_COLORS[0] as string],
  });

  constructor() {
    this.api.list().subscribe({
      next: (rooms) => {
        this.rooms.set(rooms);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.toast.show(describeHttpError(error), 'error');
      },
    });
  }

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected create(): void {
    if (this.form.invalid || this.creating()) {
      this.form.markAllAsTouched();
      return;
    }
    this.creating.set(true);
    this.api.create(this.form.getRawValue()).subscribe({
      next: (room) => {
        this.toast.show(`Sala “${room.name}” criada!`, 'success');
        void this.router.navigate(['/salas', room.slug]);
      },
      error: (error: unknown) => {
        this.creating.set(false);
        this.toast.show(describeHttpError(error, 'Não foi possível criar a sala.'), 'error');
      },
    });
  }
}
