import { Injectable } from '@angular/core';

import { AuthTokens } from '../models';

const ACCESS_KEY = 'conecta.access';
const REFRESH_KEY = 'conecta.refresh';

/** Persistência dos tokens. Falhas de storage (modo privado) não quebram o app. */
@Injectable({ providedIn: 'root' })
export class TokenStorage {
  get access(): string | null {
    return this.read(ACCESS_KEY);
  }

  get refresh(): string | null {
    return this.read(REFRESH_KEY);
  }

  save(tokens: AuthTokens): void {
    this.write(ACCESS_KEY, tokens.access);
    this.write(REFRESH_KEY, tokens.refresh);
  }

  clear(): void {
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* storage indisponível */
    }
  }

  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage indisponível */
    }
  }
}
