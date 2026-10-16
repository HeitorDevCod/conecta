import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'salas' },
  {
    path: 'entrar',
    title: 'Entrar · Conecta',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage),
  },
  {
    path: 'esqueci-senha',
    title: 'Recuperar senha · Conecta',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/forgot-password-page').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'redefinir-senha',
    title: 'Nova senha · Conecta',
    loadComponent: () => import('./features/auth/reset-password-page').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'confirmar-email',
    title: 'Confirmar e-mail · Conecta',
    loadComponent: () => import('./features/auth/verify-email-page').then((m) => m.VerifyEmailPage),
  },
  {
    path: 'salas',
    title: 'Salas · Conecta',
    canActivate: [authGuard],
    loadComponent: () => import('./features/rooms/rooms-page').then((m) => m.RoomsPage),
  },
  {
    path: 'salas/:slug',
    title: 'Sala · Conecta',
    canActivate: [authGuard],
    loadComponent: () => import('./features/room/room-page').then((m) => m.RoomPage),
  },
  { path: '**', redirectTo: 'salas' },
];
