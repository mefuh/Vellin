import type { ResolvedMedia } from '@vellin/shared';

export interface Resolver {
  readonly name: string;
  canResolve(url: URL, raw: string): boolean;
  resolve(raw: string): Promise<ResolvedMedia>;
}

export class ResolveError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ResolveError';
  }
}
