import { HttpErrorResponse, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from './auth.service';

const PUBLIC_ENDPOINTS = ['/api/auth/token/', '/api/auth/register/'];

function withToken(request: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
}

/** Anexa o JWT e, em caso de 401, tenta renovar o token uma única vez. */
export const authInterceptor: HttpInterceptorFn = (request: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const auth = inject(AuthService);
  const isApi = request.url.startsWith('/api/');
  const isPublic = PUBLIC_ENDPOINTS.some((path) => request.url.startsWith(path));

  if (!isApi || isPublic) {
    return next(request);
  }

  return next(withToken(request, auth.accessToken)).pipe(
    catchError((error: unknown) => {
      const isExpired = error instanceof HttpErrorResponse && error.status === 401;
      if (!isExpired || request.url.startsWith('/api/auth/token/refresh/')) {
        return throwError(() => error);
      }
      return auth.refreshAccessToken().pipe(
        switchMap((token) => (token ? next(withToken(request, token)) : throwError(() => error))),
      );
    }),
  );
};
