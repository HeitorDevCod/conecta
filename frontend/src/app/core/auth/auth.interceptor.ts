import { HttpErrorResponse, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from './auth.service';

/** Rotas que não levam token. Comparação exata: /verify-email/resend/ precisa do token. */
const PUBLIC_ENDPOINTS = new Set([
  '/api/auth/token/',
  '/api/auth/token/refresh/',
  '/api/auth/register/',
  '/api/auth/verify-email/',
  '/api/auth/password-reset/',
  '/api/auth/password-reset/confirm/',
]);

function withToken(request: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
}

/** Anexa o JWT e, em caso de 401, tenta renovar o token uma única vez. */
export const authInterceptor: HttpInterceptorFn = (request: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const auth = inject(AuthService);
  const isApi = request.url.startsWith('/api/');
  const isPublic = PUBLIC_ENDPOINTS.has(request.url.split('?')[0] ?? request.url);

  if (!isApi || isPublic) {
    return next(request);
  }

  return next(withToken(request, auth.accessToken)).pipe(
    catchError((error: unknown) => {
      const isExpired = error instanceof HttpErrorResponse && error.status === 401;
      if (!isExpired) {
        return throwError(() => error);
      }
      return auth.refreshAccessToken().pipe(
        switchMap((token) => (token ? next(withToken(request, token)) : throwError(() => error))),
      );
    }),
  );
};
