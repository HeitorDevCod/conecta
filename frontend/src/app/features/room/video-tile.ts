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
      <app-avatar [name]="name()" [color]="color()" [size]="84" [speaking]="speaking()" />
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
      border-radius: 22px;
      background: radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--tile-color) 35%, var(--surface)), var(--surface) 70%);
      border: 2.5px solid var(--ink);
      box-shadow: 6px 6px 0 var(--ink);
      transition: box-shadow 0.25s, transform 0.25s var(--ease-spring);
    }
    :host(.speaking) {
      box-shadow: 0 0 0 4px var(--lime), 0 0 36px rgb(182 255 0 / 0.45);
      transform: scale(1.01);
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
      padding: 6px 12px;
      border-radius: 999px;
      background: rgb(13 8 32 / 0.78);
      backdrop-filter: blur(6px);
      border: 1.5px solid var(--tile-color);
      font: 600 13px/1 var(--font-body);
    }
  `,
})
export class VideoTile {
  readonly stream = input<MediaStream | null>(null);
  readonly name = input.required<string>();
  readonly color = input('#ff2e88');
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
