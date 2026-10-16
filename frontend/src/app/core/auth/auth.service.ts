import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, switchMap, tap } from 'rxjs';

import { AuthResponse, AuthTokens, LoginPayload, RegisterPayload, User } from '../models';
import { TokenStorage } from './token-storage';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly tokens = inject(TokenStorage);

  private readonly userState = signal<User | null>(null);
  private refreshInFlight: Observable<string | null> | null = null;

  readonly user = this.userState.asReadonly();
  readonly isAuthenticated = computed(() => this.userState() !== null);

  get accessToken(): string | null {
    return this.tokens.access;
  }

  /** Executado na inicialização do app: restaura a sessão, se houver. */
  async restoreSession(): Promise<void> {
    if (!this.tokens.access && !this.tokens.refresh) {
      return;
    }
    try {
      const user = await firstValueFrom(this.http.get<User>('/api/auth/me/'));
      this.userState.set(user);
    } catch {
      this.tokens.clear();
    }
  }

  login(payload: LoginPayload): Observable<User> {
    return this.http.post<AuthTokens>('/api/auth/token/', payload).pipe(
      tap((tokens) => this.tokens.save(tokens)),
      switchMap(() => this.http.get<User>('/api/auth/me/')),
      tap((user) => this.userState.set(user)),
    );
  }

  register(payload: RegisterPayload): Observable<User> {
    return this.http.post<AuthResponse>('/api/auth/register/', payload).pipe(
      tap((response) => {
        this.tokens.save(response);
        this.userState.set(response.user);
      }),
      map((response) => response.user),
    );
  }

  /** Renova o access token. Chamadas concorrentes compartilham a mesma requisição. */
  refreshAccessToken(): Observable<string | null> {
    const refresh = this.tokens.refresh;
    if (!refresh) {
      return of(null);
    }
    this.refreshInFlight ??= this.http
      .post<AuthTokens>('/api/auth/token/refresh/', { refresh })
      .pipe(
        tap((tokens) => this.tokens.save(tokens)),
        map((tokens) => tokens.access),
        catchError(() => {
          this.logout();
          return of(null);
        }),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.refreshInFlight;
  }

  logout(): void {
    this.tokens.clear();
    this.userState.set(null);
    void this.router.navigate(['/entrar']);
  }
}
