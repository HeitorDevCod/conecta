import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <button type="button" class="toast toast--{{ toast.tone }}" (click)="toasts.dismiss(toast.id)">
          {{ toast.text }}
        </button>
      }
    </div>
  `,
  styles: `
    .stack {
      position: fixed;
      inset: auto 16px 16px auto;
      display: grid;
      gap: 10px;
      z-index: 50;
      max-inline-size: min(360px, calc(100vw - 32px));
    }
    .toast {
      all: unset;
      cursor: pointer;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 10px 30px rgb(0 0 0 / 0.5);
      font: 600 14px/1.4 var(--font-body);
      color: var(--ink);
      animation: pop-in 0.3s ease-out;
    }
    .toast:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
    .toast--info { background: var(--cyan); }
    .toast--success { background: var(--lime); }
    .toast--error { background: var(--pink); }
  `,
})
export class ToastsComponent {
  protected readonly toasts = inject(ToastService);
}
