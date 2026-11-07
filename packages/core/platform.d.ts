/*
 * The browser APIs core calls, declared narrowly for core's own typecheck.
 *
 * `packages/core/tsconfig.json` compiles core without the DOM lib, so reaching
 * for `document`, `window` or any other browser global is a compile error.
 * Each name here is one core uses on purpose, with only the members it reads;
 * a new one has to be added here first, which keeps the list deliberate.
 *
 * Only core's config includes this file. The root config compiles the same
 * sources against the full DOM lib, which these would collide with.
 */

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StorageEvent {
  readonly key: string | null;
  readonly newValue: string | null;
}

interface MessageEvent<T = unknown> {
  readonly data: T;
}

declare class BroadcastChannel {
  constructor(name: string);
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

declare var localStorage: Storage | undefined;
declare var addEventListener:
  ((type: 'storage', listener: (event: StorageEvent) => void) => void) | undefined;
declare var removeEventListener:
  ((type: 'storage', listener: (event: StorageEvent) => void) => void) | undefined;

interface RequestInit {
  readonly cache?: string;
  readonly credentials?: string;
  readonly signal?: unknown;
}

interface Response {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

declare function fetch(url: string, init?: RequestInit): Promise<Response>;

declare class Image {
  decoding: string;
  referrerPolicy: string;
  src: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

declare var console: { error(...data: unknown[]): void };
