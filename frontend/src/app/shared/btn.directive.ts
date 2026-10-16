import { Directive, ElementRef, inject, input } from '@angular/core';

export type BtnVariant = 'pink' | 'cyan' | 'lime' | 'orange' | 'violet' | 'ghost' | 'danger';
export type BtnSize = 'sm' | 'md' | 'lg' | 'icon';

const BURST_COLORS = ['#ff2e88', '#00e5ff', '#b6ff00', '#ffd60a', '#8b5cf6', '#ff8a00'] as const;
const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Botão da marca: preenchimento vibrante, sombra sólida deslocada que "afunda"
 * ao pressionar, onda a partir do ponto de toque e explosão de confete no clique.
 *
 * Uso: <button appBtn="cyan" size="lg">Entrar</button>
 */
@Directive({
  selector: 'button[appBtn], a[appBtn]',
  host: {
    class: 'btn',
    '[class]': '"btn btn--" + (appBtn() || "pink") + " btn--" + size()',
    '[class.btn--active]': 'active()',
    '(pointerdown)': 'ripple($event)',
    '(click)': 'burst($event)',
  },
})
export class BtnDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly appBtn = input<BtnVariant | ''>('pink');
  readonly size = input<BtnSize>('md');
  readonly active = input(false);
  readonly confetti = input(true);

  protected ripple(event: Event): void {
    if (!(event instanceof PointerEvent) || reducedMotion()) return;
    const element = this.host.nativeElement;
    const rect = element.getBoundingClientRect();
    const diameter = Math.max(rect.width, rect.height) * 2.2;
    const wave = document.createElement('span');
    wave.className = 'btn__ripple';
    wave.style.width = wave.style.height = `${diameter}px`;
    wave.style.left = `${event.clientX - rect.left - diameter / 2}px`;
    wave.style.top = `${event.clientY - rect.top - diameter / 2}px`;
    element.appendChild(wave);
    wave.addEventListener('animationend', () => wave.remove(), { once: true });
  }

  protected burst(event: Event): void {
    if (!(event instanceof MouseEvent) || !this.confetti() || reducedMotion()) return;
    const originX = event.clientX || this.host.nativeElement.getBoundingClientRect().left;
    const originY = event.clientY || this.host.nativeElement.getBoundingClientRect().top;
    const pieces = 10;
    for (let i = 0; i < pieces; i++) {
      const dot = document.createElement('span');
      const angle = (Math.PI * 2 * i) / pieces + Math.random() * 0.5;
      const distance = 28 + Math.random() * 34;
      dot.className = 'btn-confetti';
      dot.style.left = `${originX}px`;
      dot.style.top = `${originY}px`;
      dot.style.background = BURST_COLORS[i % BURST_COLORS.length] ?? '#fff';
      dot.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
      dot.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
      dot.style.setProperty('--rot', `${Math.round(Math.random() * 360)}deg`);
      document.body.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
    }
  }
}
