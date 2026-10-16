import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--avatar-color]': 'color()',
    '[style.--avatar-size]': 'size() + "px"',
    '[attr.title]': 'name()',
    '[class.is-speaking]': 'speaking()',
  },
  template: `{{ initials() }}`,
  styles: `
    :host {
      --avatar-size: 40px;
      display: inline-grid;
      place-items: center;
      inline-size: var(--avatar-size);
      block-size: var(--avatar-size);
      flex: none;
      border-radius: 34%;
      background: var(--avatar-color);
      color: var(--ink);
      border: 2px solid var(--ink);
      box-shadow: 3px 3px 0 var(--ink);
      font: 800 calc(var(--avatar-size) * 0.4) / 1 var(--font-display);
      letter-spacing: -0.02em;
      user-select: none;
      transition: box-shadow 0.2s, transform 0.2s;
    }
    :host(.is-speaking) {
      box-shadow: 0 0 0 3px var(--lime), 0 0 24px var(--lime);
      transform: scale(1.04);
    }
  `,
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly color = input('#ff2e88');
  readonly size = input(40);
  readonly speaking = input(false);

  protected readonly initials = computed(() =>
    this.name()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join(''),
  );
}
