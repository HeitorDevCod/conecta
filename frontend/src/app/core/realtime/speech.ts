/* Tipagem mínima da Web Speech API (não incluída no lib.dom do TypeScript). */

export interface SpeechAlternative {
  readonly transcript: string;
}

export interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechAlternative;
}

export interface SpeechResultList {
  readonly length: number;
  readonly [index: number]: SpeechResult;
}

export interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechResultList;
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechWindow {
  readonly SpeechRecognition?: SpeechRecognitionCtor;
  readonly webkitSpeechRecognition?: SpeechRecognitionCtor;
}

function speechCtor(): SpeechRecognitionCtor | undefined {
  const speechWindow = window as unknown as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

export function isSpeechSupported(): boolean {
  return speechCtor() !== undefined;
}

export function createSpeechRecognition(): SpeechRecognitionLike | null {
  const Ctor = speechCtor();
  return Ctor ? new Ctor() : null;
}
