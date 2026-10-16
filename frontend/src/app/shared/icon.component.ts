import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const PATHS = {
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3M8 21h8',
  micOff: 'M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.9-.8M5 11a7 7 0 0 0 11.6 5.3M19 11a7 7 0 0 1-.6 2.8M12 18v3M8 21h8',
  cam: 'M3 7h12v10H3zM15 10l6-3v10l-6-3',
  camOff: 'M3 3l18 18M15 11V7H8M3 7v10h12M15 10l6-3v10l-4-2',
  screen: 'M3 4h18v12H3zM8 20h8M12 16v4M12 13V7M9 10l3-3 3 3',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  hangup: 'M3 15c5-5 13-5 18 0l-2.5 2.5-3.5-1.5v-2.5a9 9 0 0 0-6 0V16l-3.5 1.5z',
  send: 'M4 12l16-8-6 16-2-7z',
  plus: 'M12 5v14M5 12h14',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  captions: 'M3 6h18v12H3zM7 11a2 2 0 0 1 3-1M7 13a2 2 0 0 0 3 1M14 11a2 2 0 0 1 3-1M14 13a2 2 0 0 0 3 1',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7M18 14a6 6 0 0 1 4 7',
  hash: 'M5 9h15M4 15h15M10 3L8 21M16 3l-2 18',
  back: 'M15 5l-7 7 7 7',
  chat: 'M4 5h16v11H9l-5 4z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
} as const;

export type IconName = keyof typeof PATHS;

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path [attr.d]="path()" />
    </svg>
  `,
  styles: `
    :host { display: inline-flex; line-height: 0; }
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  protected readonly path = computed(() => PATHS[this.name()]);
}
