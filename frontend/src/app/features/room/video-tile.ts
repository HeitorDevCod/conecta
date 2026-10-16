import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, input, viewChild } from '@angular/core';

import { AvatarComponent } from '../../shared/avatar.component';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-video-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, IconComponent],
  host: {
    '[class.speaking]': 'speaking()',
    '[class.no-video]': '!videoOn() || !stream()',
    '[style.--tile-color]': 'color()',
  },
  template: `
    <video #video autoplay playsinline [muted]="local()" [class.mirror]="local() && !screen()"></video>
    <div class="placeholder">
      <app-avatar [name]="name()" [color]="color()" [size]="76" [speaking]="speaking()" />
    </div>
    <span class="label">
      @if (!audioOn()) {
        <app-icon name="micOff" [size]="14" />
      }
      {{ name() }}{{ local() ? ' (você)' : '' }}
    </span>
  `,
  styles: `
    :host {
      position: relative;
      overflow: hidden;
      aspect-ratio: 16 / 10;
      border-radius: 10px;
      background: var(--surface);
      border: 1px solid var(--line);
      transition: box-shadow 0.25s, border-color 0.25s;
    }
    /* quem está falando: contorno âmbar com brilho */
    :host(.speaking) {
      border-color: var(--orange);
      box-shadow:
        0 0 0 1px var(--orange),
        0 0 32px color-mix(in srgb, var(--orange) 35%, transparent);
    }
    video {
      inline-size: 100%;
      block-size: 100%;
      object-fit: cover;
      display: block;
    }
    video.mirror { transform: scaleX(-1); }
    :host(.no-video) video { opacity: 0; position: absolute; }
    .placeholder {
      position: absolute;
      inset: 0;
      display: none;
      place-items: center;
    }
    :host(.no-video) .placeholder { display: grid; }
    .label {
      position: absolute;
      inset: auto auto 12px 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      border-radius: 4px;
      background: rgb(7 8 10 / 0.88);
      font: 600 12px/1 var(--font-body);
    }
    .label app-icon { color: var(--pink); }
  `,
})
export class VideoTile {
  readonly stream = input<MediaStream | null>(null);
  readonly name = input.required<string>();
  readonly color = input('#ffa53a');
  readonly local = input(false);
  readonly screen = input(false);
  readonly speaking = input(false);
  readonly audioOn = input(true);
  readonly videoOn = input(true);

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  constructor() {
    afterRenderEffect(() => {
      const element = this.video().nativeElement;
      const stream = this.stream();
      if (element.srcObject !== stream) {
        element.srcObject = stream;
      }
    });
  }
}
