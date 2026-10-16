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
      border-radius: calc(var(--avatar-size) * 0.22);
      background: var(--avatar-color);
      color: var(--ink);
      font: 600 calc(var(--avatar-size) * 0.36) / 1 var(--font-mono);
      user-select: none;
      transition: box-shadow 0.2s;
    }
    :host(.is-speaking) {
      box-shadow:
        0 0 0 2px var(--ink),
        0 0 0 3px var(--orange),
        0 0 16px color-mix(in srgb, var(--orange) 60%, transparent);
    }
  `,
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly color = input('#ffa53a');
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
