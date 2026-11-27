import { useEffect, useRef } from 'react';
import { getAuthToken } from './api';
import type { AppNotification, RealtimeNotice, TeacherLiveStatusItem } from '../types';

export function useRealtime(params: {
  enabled: boolean;
  onNotice: (notice: RealtimeNotice) => void;
  onNotification?: (notification: AppNotification) => void;
  onTeacherLiveStatus?: (statuses: TeacherLiveStatusItem[], updatedAt: string) => void;
  onSessionRevoked: () => void;
}) {
  const onNoticeRef = useRef(params.onNotice);
  const onNotificationRef = useRef(params.onNotification);
  const onLiveStatusRef = useRef(params.onTeacherLiveStatus);
  const onRevokedRef = useRef(params.onSessionRevoked);

  onNoticeRef.current = params.onNotice;
  onNotificationRef.current = params.onNotification;
  onLiveStatusRef.current = params.onTeacherLiveStatus;
  onRevokedRef.current = params.onSessionRevoked;

  useEffect(() => {
    if (!params.enabled) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByUser = false;

    const connect = () => {
      const token = getAuthToken();
      if (!token) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'auth', token }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'notice:published' && msg.notice) {
            onNoticeRef.current(msg.notice);
          } else if (msg.type === 'notification:created' && msg.notification) {
            onNotificationRef.current?.(msg.notification);
          } else if (msg.type === 'teacher:live_status' && Array.isArray(msg.statuses)) {
            onLiveStatusRef.current?.(msg.statuses, msg.updated_at || new Date().toISOString());
          } else if (msg.type === 'session:revoked') {
            onRevokedRef.current();
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!closedByUser && getAuthToken()) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      closedByUser = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [params.enabled]);
}
