import { HttpErrorResponse } from '@angular/common/http';

/** Converte respostas de erro do DRF em uma frase legível. */
export function describeHttpError(error: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }
  if (error.status === 0) {
    return 'Sem conexão com o servidor.';
  }
  const body: unknown = error.error;
  if (typeof body === 'object' && body !== null) {
    for (const value of Object.values(body as Record<string, unknown>)) {
      if (typeof value === 'string') {
        return value;
      }
      if (Array.isArray(value) && typeof value[0] === 'string') {
        return value[0];
      }
    }
  }
  return fallback;
}
