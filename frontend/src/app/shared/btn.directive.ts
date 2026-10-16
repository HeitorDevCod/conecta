import { Directive, ElementRef, inject, input } from '@angular/core';

export type BtnVariant = 'pink' | 'cyan' | 'lime' | 'orange' | 'violet' | 'yellow' | 'ghost' | 'danger';
export type BtnSize = 'sm' | 'md' | 'lg' | 'icon';

const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Botão da marca (tema Grafite Pro): preenchimento sólido em cor viva, brilho
 * na própria cor ao passar o mouse, onda a partir do ponto de toque e um anel
 * que pulsa no clique.
 *
 * Uso: <button appBtn="cyan" size="lg">Entrar</button>
 */
@Directive({
  selector: 'button[appBtn], a[appBtn]',
  host: {
    '[class]': '"btn btn--" + (appBtn() || "orange") + " btn--" + size()',
    '[class.btn--active]': 'active()',
    '(pointerdown)': 'ripple($event)',
    '(click)': 'pulse()',
  },
})
export class BtnDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly appBtn = input<BtnVariant | ''>('orange');
  readonly size = input<BtnSize>('md');
  readonly active = input(false);

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

  protected pulse(): void {
    if (reducedMotion()) return;
    const element = this.host.nativeElement;
    element.classList.remove('btn--pulse');
    void element.offsetWidth; // reinicia a animação em cliques seguidos
    element.classList.add('btn--pulse');
    element.addEventListener('animationend', () => element.classList.remove('btn--pulse'), { once: true });
  }
}
