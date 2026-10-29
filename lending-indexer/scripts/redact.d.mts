import type { Readable, Writable } from 'node:stream';

export function createRedactor(env?: Record<string, string | undefined>): (text: string) => string;
export function pipeRedacted(from: Readable, to: Writable, redact: (text: string) => string): void;
