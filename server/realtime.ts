import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { getSessionUser, type AuthUser } from './auth.ts';
import { db } from './db.ts';

interface ConnectedClient {
  ws: WebSocket;
  user: AuthUser;
  departmentId: number | null;
  classId: number | null;
}

const clients = new Set<ConnectedClient>();

export function setupRealtimeServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    let client: ConnectedClient | null = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'auth' && typeof msg.token === 'string') {
          const user = getSessionUser(msg.token);
          if (!user) {
            ws.send(JSON.stringify({ type: 'auth:error', message: 'Invalid session' }));
            ws.close();
            return;
          }
          // Look up student's department/class if student
          let departmentId: number | null = null;
          let classId: number | null = null;
          if (user.account_type === 'student' && user.institution_id) {
            const st = db
              .prepare('SELECT department_id, class_id FROM students WHERE user_id = ? AND institution_id = ?')
              .get(user.id, user.institution_id) as { department_id: number | null; class_id: number | null } | undefined;
            if (st) {
              departmentId = st.department_id;
              classId = st.class_id;
            }
          }
          client = { ws, user, departmentId, classId };
          clients.add(client);
          ws.send(JSON.stringify({ type: 'auth:ok', userId: user.id }));
        }
      } catch {
        // Ignore malformed frames
      }
    });

    ws.on('close', () => {
      if (client) {
        clients.delete(client);
      }
    });
  });

  return wss;
}

export function broadcastNotice(notice: {
  id: number;
  institution_id: number | null;
  title: string;
  description: string;
  audience_type: string;
  audience_target_id: string;
  publish_date: string;
  created_by_name: string;
}) {
  const payload = JSON.stringify({ type: 'notice:published', notice });
  for (const c of clients) {
    if (c.ws.readyState !== WebSocket.OPEN) continue;

    // Platform notice (institution_id is null) goes to all institution admins / users
    if (notice.institution_id === null) {
      if (notice.audience_type === 'all' || notice.audience_type === 'institutions') {
        c.ws.send(payload);
      } else if (
        notice.audience_type === 'specific_institution' &&
        String(c.user.institution_id) === notice.audience_target_id
      ) {
        c.ws.send(payload);
      }
      continue;
    }

    // Institution-scoped notice
    if (c.user.institution_id !== notice.institution_id) continue;

    const aud = notice.audience_type;
    const target = notice.audience_target_id;
    let matches = false;

    if (aud === 'all') matches = true;
    else if (aud === 'teachers' && (c.user.account_type === 'teacher' || c.user.account_type === 'institution_admin')) matches = true;
    else if (aud === 'students' && (c.user.account_type === 'student' || c.user.account_type === 'institution_admin')) matches = true;
    else if (aud === 'guardians' && (c.user.account_type === 'guardian' || c.user.account_type === 'institution_admin')) matches = true;
    else if (aud === 'department' && (String(c.departmentId) === target || c.user.account_type === 'institution_admin')) matches = true;
    else if (aud === 'class' && (String(c.classId) === target || c.user.account_type === 'institution_admin')) matches = true;
    else if (aud === 'role' && (String(c.user.role_id) === target || c.user.account_type === 'institution_admin')) matches = true;
    else if (aud === 'users' && target.split(',').includes(String(c.user.id))) matches = true;

    if (matches) {
      c.ws.send(payload);
    }
  }
}

export function notifySessionRevoked(token: string) {
  for (const c of clients) {
    if (c.user.session_token === token && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(JSON.stringify({ type: 'session:revoked' }));
      c.ws.close();
    }
  }
}

export function notifyUserSessionsRevoked(userId: number) {
  for (const c of clients) {
    if (c.user.id === userId && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(JSON.stringify({ type: 'session:revoked' }));
      c.ws.close();
    }
  }
}

export function broadcastNotification(userId: number, notification: any) {
  const payload = JSON.stringify({ type: 'notification:created', notification });
  for (const c of clients) {
    if (c.user.id === userId && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(payload);
    }
  }
}

export function broadcastTeacherLiveStatus(institutionId: number, statuses: any[]) {
  const payload = JSON.stringify({
    type: 'teacher:live_status',
    institution_id: institutionId,
    statuses,
    updated_at: new Date().toISOString(),
  });
  for (const c of clients) {
    if (
      c.user.institution_id === institutionId &&
      c.ws.readyState === WebSocket.OPEN &&
      ['institution_admin', 'staff', 'teacher'].includes(c.user.account_type)
    ) {
      c.ws.send(payload);
    }
  }
}

export function getConnectedInstitutionIds(): number[] {
  const ids = new Set<number>();
  for (const c of clients) {
    if (c.ws.readyState === WebSocket.OPEN && c.user.institution_id) {
      ids.add(c.user.institution_id);
    }
  }
  return Array.from(ids);
}

