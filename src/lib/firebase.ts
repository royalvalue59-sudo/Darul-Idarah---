import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// CRITICAL: Pass firebaseConfig.firestoreDatabaseId so Firestore connects to the provisioned named database
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;
export const BOOTSTRAP_ADMIN_EMAIL = 'royalvalue59@gmail.com';

// Blueprint-synchronized volumetric limits & patterns (mirrors firebase-blueprint.json verbatim)
export const BLUEPRINT_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  ID_MAX: 128,
  DISPLAY_NAME_MAX: 100,
  EMAIL_MAX: 160,
  PHOTO_URL_MAX: 500,
  LINKED_USERNAME_MAX: 64,
  INSTITUTION_NAME_MAX: 120,
  TITLE_MAX: 120,
  ANNOUNCEMENT_TITLE_MAX: 150,
  BODY_MAX: 2000,
  EXPORTED_AT_MAX: 40,
  TAGS_MAX_COUNT: 5,
  TAG_MAX_LEN: 40,
} as const;

export function clampString(value: unknown, maxLen: number): string {
  return String(value ?? '').trim().slice(0, maxLen);
}

export function sanitizeFirestoreId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'doc';
  const rand = Math.random().toString(36).slice(2, 10);
  return `${cleanPrefix}_${Date.now()}_${rand}`.slice(0, BLUEPRINT_LIMITS.ID_MAX);
}

export function sanitizeTags(tags: string[]): string[] {
  return tags
    .map((t) => clampString(t, BLUEPRINT_LIMITS.TAG_MAX_LEN))
    .filter((t) => t.length >= 1)
    .slice(0, BLUEPRINT_LIMITS.TAGS_MAX_COUNT);
}

export interface BackupMetrics {
  institutions: number;
  users: number;
  students: number;
  teachers: number;
  transactions: number;
  notices: number;
}

export function sanitizeBackupMetrics(raw: Partial<BackupMetrics>): BackupMetrics {
  const nonNegInt = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
  return {
    institutions: nonNegInt(raw.institutions),
    users: nonNegInt(raw.users),
    students: nonNegInt(raw.students),
    teachers: nonNegInt(raw.teachers),
    transactions: nonNegInt(raw.transactions),
    notices: nonNegInt(raw.notices),
  };
}

export type FirestoreConnectionStatus = 'checking' | 'connected' | 'offline';
let currentConnectionStatus: FirestoreConnectionStatus = 'checking';
const connectionListeners = new Set<(status: FirestoreConnectionStatus) => void>();

function notifyConnectionStatus(status: FirestoreConnectionStatus) {
  currentConnectionStatus = status;
  connectionListeners.forEach((cb) => cb(status));
}

export function subscribeFirestoreConnection(cb: (status: FirestoreConnectionStatus) => void) {
  cb(currentConnectionStatus);
  connectionListeners.add(cb);
  return () => {
    connectionListeners.delete(cb);
  };
}

// Startup connectivity test (required by Firebase integration guidelines)
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    notifyConnectionStatus('connected');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      notifyConnectionStatus('offline');
    } else {
      // A server response such as permission-denied confirms Cloud Firestore is reachable & enabled
      notifyConnectionStatus('connected');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
