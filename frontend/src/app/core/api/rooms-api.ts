import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { CreateRoomPayload, MessagePage, Room, RtcConfig } from '../models';

@Injectable({ providedIn: 'root' })
export class RoomsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<Room[]> {
    return this.http.get<Room[]>('/api/rooms/');
  }

  get(slug: string): Observable<Room> {
    return this.http.get<Room>(`/api/rooms/${encodeURIComponent(slug)}/`);
  }

  create(payload: CreateRoomPayload): Observable<Room> {
    return this.http.post<Room>('/api/rooms/', payload);
  }

  join(slug: string): Observable<Room> {
    return this.http.post<Room>(`/api/rooms/${encodeURIComponent(slug)}/join/`, {});
  }

  messages(slug: string, before?: string): Observable<MessagePage> {
    const params = before ? new HttpParams().set('before', before) : undefined;
    return this.http.get<MessagePage>(`/api/rooms/${encodeURIComponent(slug)}/messages/`, { params });
  }

  rtcConfig(): Observable<RtcConfig> {
    return this.http.get<RtcConfig>('/api/rtc/config/');
  }
}
