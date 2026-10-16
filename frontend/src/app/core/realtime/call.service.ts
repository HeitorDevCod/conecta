import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { RoomsApi } from '../api/rooms-api';
import { MediaState, Peer, PeerId, Reaction, ServerEvent, ServerEventOf, SessionDescription } from '../models';
import { ToastService } from '../toast.service';
import { RoomSocket } from './room-socket';
import {
  SpeechRecognitionEventLike,
  SpeechRecognitionLike,
  createSpeechRecognition,
  isSpeechSupported,
} from './speech';

export const LOCAL_KEY = 'local' as const;
export type StreamKey = PeerId | typeof LOCAL_KEY;

export interface LiveCaption {
  readonly peerId: PeerId;
  readonly displayName: string;
  readonly text: string;
  readonly final: boolean;
}

export interface FloatingReaction {
  readonly id: number;
  readonly emoji: Reaction;
  readonly peerId: PeerId;
  readonly left: number;
}

interface PeerLink {
  readonly pc: RTCPeerConnection;
  readonly polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  tracksAdded: boolean;
  pendingCandidates: RTCIceCandidateInit[];
}

interface AudioMeter {
  readonly source: MediaStreamAudioSourceNode;
  readonly analyser: AnalyserNode;
  readonly buffer: Uint8Array<ArrayBuffer>;
}

const SPEAKING_THRESHOLD = 0.035;
const CAPTION_TTL_MS = 4500;
const REACTION_TTL_MS = 2800;

/**
 * Chamada de voz/vídeo de uma sala em topologia mesh.
 * Usa o padrão "perfect negotiation" do WebRTC para evitar colisões de ofertas.
 */
@Injectable()
export class CallService {
  private readonly socket = inject(RoomSocket);
  private readonly api = inject(RoomsApi);
  private readonly toast = inject(ToastService);

  private selfId: PeerId | null = null;
  private iceServers: RTCIceServer[] = [];
  private readonly links = new Map<PeerId, PeerLink>();
  private screenTrack: MediaStreamTrack | null = null;

  private audioContext: AudioContext | null = null;
  private readonly meters = new Map<StreamKey, AudioMeter>();
  private meterTimer: ReturnType<typeof setInterval> | null = null;

  private recognition: SpeechRecognitionLike | null = null;
  private lastInterimSentAt = 0;
  private readonly captionTimers = new Map<PeerId, ReturnType<typeof setTimeout>>();
  private reactionSeq = 0;

  readonly inCall = signal(false);
  readonly joining = signal(false);
  readonly localStream = signal<MediaStream | null>(null);
  readonly remoteStreams = signal<ReadonlyMap<PeerId, MediaStream>>(new Map());
  readonly media = signal<MediaState>({ audio: true, video: true });
  readonly hasCamera = signal(true);
  readonly screenSharing = signal(false);
  readonly speaking = signal<ReadonlySet<StreamKey>>(new Set());
  readonly captionsOn = signal(false);
  readonly captionsSupported = isSpeechSupported();
  readonly captions = signal<ReadonlyMap<PeerId, LiveCaption>>(new Map());
  readonly reactions = signal<readonly FloatingReaction[]>([]);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  setSelf(peerId: PeerId): void {
    this.selfId = peerId;
  }

  // ------------------------------------------------------------------ entrar / sair

  async join(): Promise<void> {
    if (this.inCall() || this.joining()) {
      return;
    }
    this.joining.set(true);
    try {
      const config = await firstValueFrom(this.api.rtcConfig());
      this.iceServers = config.iceServers;

      const stream = await this.acquireMedia();
      if (!stream) {
        this.toast.show('Não conseguimos acessar microfone nem câmera.', 'error');
        return;
      }
      this.localStream.set(stream);
      this.watchSpeaking(LOCAL_KEY, stream);

      const media: MediaState = {
        audio: stream.getAudioTracks().length > 0,
        video: stream.getVideoTracks().length > 0,
      };
      this.media.set(media);
      this.hasCamera.set(media.video);
      this.inCall.set(true);
      this.socket.send({ type: 'call.join', media });
    } catch (error: unknown) {
      console.error(error);
      this.toast.show('Falha ao entrar na chamada.', 'error');
    } finally {
      this.joining.set(false);
    }
  }

  leave(): void {
    if (!this.inCall()) {
      return;
    }
    this.socket.send({ type: 'call.leave' });
    this.teardown();
  }

  /** Encerra tudo localmente (também usado quando a conexão cai). */
  teardown(): void {
    for (const peerId of [...this.links.keys()]) {
      this.closeLink(peerId);
    }
    this.localStream()?.getTracks().forEach((track) => track.stop());
    this.screenTrack?.stop();
    this.screenTrack = null;
    this.stopCaptions();
    for (const key of [...this.meters.keys()]) {
      this.unwatchSpeaking(key);
    }
    if (this.meterTimer) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
    void this.audioContext?.close();
    this.audioContext = null;

    this.localStream.set(null);
    this.screenSharing.set(false);
    this.inCall.set(false);
  }

  // ------------------------------------------------------------------ controles

  toggleAudio(): void {
    this.setMedia({ ...this.media(), audio: !this.media().audio });
  }

  toggleVideo(): void {
    if (!this.hasCamera()) {
      this.toast.show('Nenhuma câmera disponível.', 'info');
      return;
    }
    this.setMedia({ ...this.media(), video: !this.media().video });
  }

  async toggleScreenShare(): Promise<void> {
    if (this.screenTrack) {
      this.stopScreenShare();
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      if (!track) {
        return;
      }
      this.screenTrack = track;
      track.onended = () => this.stopScreenShare();
      await this.replaceOutgoingVideo(track);
      this.screenSharing.set(true);
    } catch {
      /* usuário cancelou a seleção */
    }
  }

  react(emoji: Reaction): void {
    this.socket.send({ type: 'call.reaction', emoji });
  }

  toggleCaptions(): void {
    if (this.captionsOn()) {
      this.stopCaptions();
      return;
    }
    const recognition = createSpeechRecognition();
    if (!recognition) {
      this.toast.show('Seu navegador não suporta legendas ao vivo.', 'info');
      return;
    }
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => this.onSpeechResult(event);
    recognition.onend = () => {
      if (this.captionsOn() && this.inCall()) {
        recognition.start();
      }
    };
    recognition.onerror = () => undefined;
    this.recognition = recognition;
    this.captionsOn.set(true);
    recognition.start();
    this.toast.show('Legendas ao vivo ativadas: sua fala aparece para todos.', 'success');
  }

  // ------------------------------------------------------------------ eventos do servidor

  handleEvent(event: ServerEvent): void {
    switch (event.type) {
      case 'call.accepted':
        this.onAccepted(event.participants);
        break;
      case 'call.left':
        this.closeLink(event.peerId);
        break;
      case 'rtc.offer':
        void this.onOffer(event);
        break;
      case 'rtc.answer':
        void this.onAnswer(event);
        break;
      case 'rtc.ice':
        void this.onIce(event);
        break;
      case 'call.reaction':
        this.showReaction(event.peerId, event.emoji);
        break;
      case 'call.caption':
        this.showCaption(event);
        break;
      default:
        break;
    }
  }

  private onAccepted(participants: readonly Peer[]): void {
    // Quem entra inicia a negociação com todos que já estão na chamada.
    for (const participant of participants) {
      this.createLink(participant.peerId, true);
    }
  }

  private async onOffer(event: ServerEventOf<'rtc.offer'>): Promise<void> {
    if (!this.inCall()) {
      return;
    }
    const link = this.links.get(event.from) ?? this.createLink(event.from, false);
    const collision = link.makingOffer || link.pc.signalingState !== 'stable';
    link.ignoreOffer = !link.polite && collision;
    if (link.ignoreOffer) {
      return;
    }
    await link.pc.setRemoteDescription(event.sdp);
    if (!link.tracksAdded) {
      this.addLocalTracks(link);
    }
    await link.pc.setLocalDescription();
    this.sendDescription(event.from, link.pc.localDescription);
    await this.flushCandidates(link);
  }

  private async onAnswer(event: ServerEventOf<'rtc.answer'>): Promise<void> {
    const link = this.links.get(event.from);
    if (!link || link.pc.signalingState !== 'have-local-offer') {
      return;
    }
    await link.pc.setRemoteDescription(event.sdp);
    await this.flushCandidates(link);
  }

  private async onIce(event: ServerEventOf<'rtc.ice'>): Promise<void> {
    const link = this.links.get(event.from);
    if (!link) {
      return;
    }
    if (!link.pc.remoteDescription) {
      link.pendingCandidates.push(event.candidate);
      return;
    }
    try {
      await link.pc.addIceCandidate(event.candidate);
    } catch (error: unknown) {
      if (!link.ignoreOffer) {
        console.warn('Candidato ICE rejeitado', error);
      }
    }
  }

  // ------------------------------------------------------------------ conexões

  private createLink(peerId: PeerId, initiator: boolean): PeerLink {
    this.closeLink(peerId);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const link: PeerLink = {
      pc,
      polite: (this.selfId ?? '') < peerId,
      makingOffer: false,
      ignoreOffer: false,
      tracksAdded: false,
      pendingCandidates: [],
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.socket.send({ type: 'rtc.ice', to: peerId, candidate: candidate.toJSON() });
      }
    };

    pc.ontrack = ({ track, streams }) => {
      const stream = streams[0] ?? new MediaStream([track]);
      this.remoteStreams.update((current) => new Map(current).set(peerId, stream));
      if (track.kind === 'audio') {
        this.watchSpeaking(peerId, stream);
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        link.makingOffer = true;
        await pc.setLocalDescription();
        this.sendDescription(peerId, pc.localDescription);
      } catch (error: unknown) {
        console.error('Falha na negociação', error);
      } finally {
        link.makingOffer = false;
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        pc.restartIce();
      }
    };

    this.links.set(peerId, link);
    if (initiator) {
      this.addLocalTracks(link);
    }
    return link;
  }

  private closeLink(peerId: PeerId): void {
    const link = this.links.get(peerId);
    if (!link) {
      return;
    }
    link.pc.onicecandidate = null;
    link.pc.ontrack = null;
    link.pc.onnegotiationneeded = null;
    link.pc.close();
    this.links.delete(peerId);
    this.unwatchSpeaking(peerId);
    this.remoteStreams.update((current) => {
      const next = new Map(current);
      next.delete(peerId);
      return next;
    });
  }

  private addLocalTracks(link: PeerLink): void {
    const stream = this.localStream();
    if (!stream) {
      return;
    }
    for (const track of stream.getTracks()) {
      const outgoing = track.kind === 'video' && this.screenTrack ? this.screenTrack : track;
      link.pc.addTrack(outgoing, stream);
    }
    link.tracksAdded = true;
  }

  private sendDescription(to: PeerId, description: RTCSessionDescription | null): void {
    if (!description || (description.type !== 'offer' && description.type !== 'answer')) {
      return;
    }
    const sdp: SessionDescription = { type: description.type, sdp: description.sdp };
    this.socket.send(
      description.type === 'offer' ? { type: 'rtc.offer', to, sdp } : { type: 'rtc.answer', to, sdp },
    );
  }

  private async flushCandidates(link: PeerLink): Promise<void> {
    const pending = link.pendingCandidates.splice(0);
    for (const candidate of pending) {
      try {
        await link.pc.addIceCandidate(candidate);
      } catch {
        /* candidato obsoleto */
      }
    }
  }

  // ------------------------------------------------------------------ mídia local

  private async acquireMedia(): Promise<MediaStream | null> {
    const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    const video: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };
    const attempts: MediaStreamConstraints[] = [{ audio, video }, { audio }, { video }];
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        /* tenta a próxima combinação */
      }
    }
    return null;
  }

  private setMedia(media: MediaState): void {
    const stream = this.localStream();
    stream?.getAudioTracks().forEach((track) => (track.enabled = media.audio));
    stream?.getVideoTracks().forEach((track) => (track.enabled = media.video));
    this.media.set(media);
    this.socket.send({ type: 'call.media', media });
  }

  private stopScreenShare(): void {
    const camera = this.localStream()?.getVideoTracks()[0] ?? null;
    this.screenTrack?.stop();
    this.screenTrack = null;
    this.screenSharing.set(false);
    void this.replaceOutgoingVideo(camera);
  }

  private async replaceOutgoingVideo(track: MediaStreamTrack | null): Promise<void> {
    const stream = this.localStream();
    for (const link of this.links.values()) {
      const sender = link.pc.getSenders().find((candidate) => candidate.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(track);
      } else if (track && stream) {
        link.pc.addTrack(track, stream); // dispara renegociação automática
      }
    }
  }

  // ------------------------------------------------------------------ quem está falando

  private watchSpeaking(key: StreamKey, stream: MediaStream): void {
    if (this.meters.has(key) || stream.getAudioTracks().length === 0) {
      return;
    }
    this.audioContext ??= new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    this.meters.set(key, { source, analyser, buffer: new Uint8Array(analyser.fftSize) });
    this.meterTimer ??= setInterval(() => this.sampleMeters(), 180);
  }

  private unwatchSpeaking(key: StreamKey): void {
    const meter = this.meters.get(key);
    if (!meter) {
      return;
    }
    meter.source.disconnect();
    this.meters.delete(key);
  }

  private sampleMeters(): void {
    const active = new Set<StreamKey>();
    for (const [key, meter] of this.meters) {
      if (key === LOCAL_KEY && !this.media().audio) {
        continue;
      }
      meter.analyser.getByteTimeDomainData(meter.buffer);
      let sum = 0;
      for (const sample of meter.buffer) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      if (Math.sqrt(sum / meter.buffer.length) > SPEAKING_THRESHOLD) {
        active.add(key);
      }
    }
    const previous = this.speaking();
    const changed = active.size !== previous.size || [...active].some((key) => !previous.has(key));
    if (changed) {
      this.speaking.set(active);
    }
  }

  // ------------------------------------------------------------------ legendas e reações

  private onSpeechResult(event: SpeechRecognitionEventLike): void {
    const result = event.results[event.results.length - 1];
    const text = result?.[0]?.transcript.trim();
    if (!result || !text) {
      return;
    }
    const now = performance.now();
    if (!result.isFinal && now - this.lastInterimSentAt < 350) {
      return;
    }
    this.lastInterimSentAt = now;
    this.socket.send({ type: 'call.caption', text, final: result.isFinal });
  }

  private stopCaptions(): void {
    this.captionsOn.set(false);
    if (this.recognition) {
      this.recognition.onend = null;
      this.recognition.stop();
      this.recognition = null;
    }
  }

  private showCaption(event: ServerEventOf<'call.caption'>): void {
    const caption: LiveCaption = {
      peerId: event.peerId,
      displayName: event.displayName,
      text: event.text,
      final: event.final,
    };
    this.captions.update((current) => new Map(current).set(event.peerId, caption));

    const existing = this.captionTimers.get(event.peerId);
    if (existing) {
      clearTimeout(existing);
    }
    this.captionTimers.set(
      event.peerId,
      setTimeout(() => {
        this.captionTimers.delete(event.peerId);
        this.captions.update((current) => {
          const next = new Map(current);
          next.delete(event.peerId);
          return next;
        });
      }, CAPTION_TTL_MS),
    );
  }

  private showReaction(peerId: PeerId, emoji: Reaction): void {
    const reaction: FloatingReaction = { id: ++this.reactionSeq, emoji, peerId, left: 8 + Math.random() * 84 };
    this.reactions.update((list) => [...list, reaction].slice(-24));
    setTimeout(() => {
      this.reactions.update((list) => list.filter((item) => item.id !== reaction.id));
    }, REACTION_TTL_MS);
  }
}
