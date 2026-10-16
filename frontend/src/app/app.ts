import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ToastsComponent } from './shared/toasts.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ToastsComponent],
  template: `
    <div class="aurora" aria-hidden="true">
      <span class="blob blob--pink"></span>
      <span class="blob blob--cyan"></span>
      <span class="blob blob--lime"></span>
    </div>
    <router-outlet />
    <app-toasts />
  `,
  styles: `
    .aurora {
      position: fixed;
      inset: 0;
      z-index: -1;
      overflow: hidden;
      pointer-events: none;
    }
    .blob {
      position: absolute;
      inline-size: 46vmax;
      block-size: 46vmax;
      border-radius: 50%;
      filter: blur(90px);
      opacity: 0.32;
      animation: drift 22s ease-in-out infinite alternate;
    }
    .blob--pink { background: var(--pink); inset: -18vmax auto auto -12vmax; }
    .blob--cyan { background: var(--cyan); inset: auto -16vmax -20vmax auto; animation-delay: -7s; }
    .blob--lime { background: var(--lime); inset: 30% auto auto 45%; opacity: 0.14; animation-delay: -14s; }
    @keyframes drift {
      to { transform: translate(8vmax, 6vmax) scale(1.15); }
    }
  `,
})
export class App {}
