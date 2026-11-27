import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import {
  auth,
  BLUEPRINT_LIMITS,
  BOOTSTRAP_ADMIN_EMAIL,
  clampString,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  sanitizeBackupMetrics,
  sanitizeFirestoreId,
  sanitizeTags,
  subscribeFirestoreConnection,
  type BackupMetrics,
  type FirestoreConnectionStatus,
} from '../lib/firebase';
import { useApp } from './AppContext';

export interface CloudInstitutionRecord {
  id: string;
  ownerId: string;
  institutionCode: string;
  name: string;
  status: 'active' | 'draft' | 'pending' | 'suspended';
  academicYear: string;
  studentCount: number;
  teacherCount: number;
  totalIncome: number;
  totalExpense: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface CloudBackupRecord {
  id: string;
  ownerId: string;
  scope: 'platform' | 'institution';
  title: string;
  institutionName: string;
  recordCount: number;
  status: 'active' | 'archived';
  summaryText: string;
  exportedAtDhaka: string;
  metrics: BackupMetrics;
  tags: string[];
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface CloudNoteRecord {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  category: 'general' | 'academic' | 'finance' | 'hostel' | 'support';
  status: 'open' | 'done';
  tags: string[];
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface CloudAnnouncementRecord {
  id: string;
  authorId: string;
  title: string;
  message: string;
  priority: 'normal' | 'important' | 'urgent';
  status: 'draft' | 'published' | 'archived';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

interface FirebaseContextValue {
  firebaseUser: FirebaseUser | null;
  authReady: boolean;
  profileReady: boolean;
  firestoreStatus: FirestoreConnectionStatus;
  isFirebaseAdmin: boolean;
  cloudInstitutions: CloudInstitutionRecord[];
  cloudBackups: CloudBackupRecord[];
  cloudNotes: CloudNoteRecord[];
  cloudAnnouncements: CloudAnnouncementRecord[];
  signInWithGoogle: () => Promise<void>;
  signOutFirebase: () => Promise<void>;
  syncInstitutionToCloud: (input: {
    institutionCode: string;
    name: string;
    status: 'active' | 'draft' | 'pending' | 'suspended';
    academicYear: string;
    studentCount: number;
    teacherCount: number;
    totalIncome: number;
    totalExpense: number;
  }) => Promise<string>;
  deleteCloudInstitution: (institutionId: string) => Promise<void>;
  createCloudBackup: (input: {
    scope: 'platform' | 'institution';
    title: string;
    institutionName: string;
    recordCount: number;
    summaryText: string;
    exportedAtDhaka: string;
    metrics: Partial<BackupMetrics>;
    tags?: string[];
  }) => Promise<string>;
  archiveCloudBackup: (backupId: string) => Promise<void>;
  deleteCloudBackup: (backupId: string) => Promise<void>;
  createCloudNote: (input: {
    title: string;
    body: string;
    category: CloudNoteRecord['category'];
    tags?: string[];
  }) => Promise<string>;
  completeCloudNote: (noteId: string) => Promise<void>;
  deleteCloudNote: (noteId: string) => Promise<void>;
  createCloudAnnouncement: (input: {
    title: string;
    message: string;
    priority: CloudAnnouncementRecord['priority'];
    status: 'draft' | 'published';
  }) => Promise<string>;
  archiveCloudAnnouncement: (announcementId: string) => Promise<void>;
  deleteCloudAnnouncement: (announcementId: string) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

function tsToMillis(ts?: Timestamp | null): number {
  if (!ts) return 0;
  try {
    return typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
  } catch {
    return 0;
  }
}

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const { user: darulUser, institution, theme, toast } = useApp();
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [firestoreStatus, setFirestoreStatus] = useState<FirestoreConnectionStatus>('checking');
  const [isFirebaseAdmin, setIsFirebaseAdmin] = useState(false);
  const [cloudInstitutions, setCloudInstitutions] = useState<CloudInstitutionRecord[]>([]);
  const [cloudBackups, setCloudBackups] = useState<CloudBackupRecord[]>([]);
  const [cloudNotes, setCloudNotes] = useState<CloudNoteRecord[]>([]);
  const [cloudAnnouncements, setCloudAnnouncements] = useState<CloudAnnouncementRecord[]>([]);

  useEffect(() => subscribeFirestoreConnection(setFirestoreStatus), []);

  // 1. Track Firebase Auth state via onAuthStateChanged
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser);
      setAuthReady(true);
      if (!fbUser) {
        setProfileReady(false);
        setIsFirebaseAdmin(false);
        setCloudInstitutions([]);
        setCloudBackups([]);
        setCloudNotes([]);
        setCloudAnnouncements([]);
      }
    });
    return () => unsub();
  }, []);

  // 2. Ensure split public/private user profile documents exist & check admin status
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    let cancelled = false;

    const syncUserDocs = async () => {
      const uid = firebaseUser.uid;
      const publicPath = `users/${uid}`;
      const privatePath = `users/${uid}/private/info`;
      const adminPath = `admins/${uid}`;

      const bootstrapMatch =
        firebaseUser.emailVerified &&
        firebaseUser.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

      if (bootstrapMatch) {
        if (!cancelled) setIsFirebaseAdmin(true);
      } else {
        try {
          const adminSnap = await getDoc(doc(db, 'admins', uid));
          if (!cancelled) setIsFirebaseAdmin(adminSnap.exists());
        } catch {
          if (!cancelled) setIsFirebaseAdmin(false);
        }
      }

      if (!firebaseUser.emailVerified) {
        if (!cancelled) setProfileReady(false);
        return;
      }

      const displayName =
        clampString(
          darulUser?.full_name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'ব্যবহারকারী',
          BLUEPRINT_LIMITS.DISPLAY_NAME_MAX
        ) || 'ব্যবহারকারী';
      const preferredTheme: 'light' | 'dark' = theme === 'dark' ? 'dark' : 'light';

      // Step A: Create or update parent /users/{uid} FIRST (Master Gate for subcollections)
      try {
        const pubRef = doc(db, 'users', uid);
        const pubSnap = await getDoc(pubRef);
        if (!pubSnap.exists()) {
          await setDoc(pubRef, {
            uid,
            displayName,
            preferredTheme,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(pubRef, {
            displayName,
            preferredTheme,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.WRITE, publicPath);
        } catch {
          // Handled and logged via handleFirestoreError
        }
        return;
      }

      // Step B: Create or update isolated PII /users/{uid}/private/info
      const email = clampString(firebaseUser.email || '', BLUEPRINT_LIMITS.EMAIL_MAX);
      const photoURL = clampString(firebaseUser.photoURL || '', BLUEPRINT_LIMITS.PHOTO_URL_MAX);
      const linkedUsername = clampString(darulUser?.username || '', BLUEPRINT_LIMITS.LINKED_USERNAME_MAX);
      const linkedAccountType = darulUser?.account_type || '';
      const linkedInstitutionName = clampString(
        institution?.name || (darulUser?.account_type === 'super_admin' ? 'দারুল ইদারা প্ল্যাটফর্ম' : ''),
        BLUEPRINT_LIMITS.INSTITUTION_NAME_MAX
      );

      try {
        const privRef = doc(db, 'users', uid, 'private', 'info');
        const privSnap = await getDoc(privRef);
        if (!privSnap.exists()) {
          await setDoc(privRef, {
            uid,
            email,
            photoURL,
            linkedUsername,
            linkedAccountType,
            linkedInstitutionName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(privRef, {
            email,
            photoURL,
            linkedUsername,
            linkedAccountType,
            linkedInstitutionName,
            updatedAt: serverTimestamp(),
          });
        }
        if (!cancelled) setProfileReady(true);
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.WRITE, privatePath);
        } catch {
          // Logged via handleFirestoreError
        }
      }
    };

    syncUserDocs();
    return () => {
      cancelled = true;
    };
  }, [authReady, firebaseUser, darulUser?.username, darulUser?.full_name, darulUser?.account_type, institution?.name, theme]);

  // 3. Attach real-time Firestore onSnapshot listeners ONLY when authReady && firebaseUser
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    const uid = firebaseUser.uid;
    const isBootAdmin =
      firebaseUser.emailVerified &&
      firebaseUser.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

    // Listener 0: Owner-scoped Cloud Institutions
    const instQuery = query(collection(db, 'institutions'), where('ownerId', '==', uid));
    const unsubInst = onSnapshot(
      instQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<CloudInstitutionRecord, 'id'>) }))
          .sort((a, b) => tsToMillis(b.updatedAt) - tsToMillis(a.updatedAt));
        setCloudInstitutions(list);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'institutions');
        } catch {
          toast('error', 'প্রতিষ্ঠান ক্লাউড সিঙ্ক লোড ব্যর্থ', 'অনুমতি বা নেটওয়ার্ক যাচাই করুন।');
        }
      }
    );

    // Listener 1: Owner-scoped Cloud Backups
    const backupsQuery = query(collection(db, 'cloudBackups'), where('ownerId', '==', uid));
    const unsubBackups = onSnapshot(
      backupsQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<CloudBackupRecord, 'id'>) }))
          .sort((a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));
        setCloudBackups(list);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'cloudBackups');
        } catch {
          toast('error', 'ফায়ারস্টোর ব্যাকআপ লোড ব্যর্থ', 'অনুমতি বা নেটওয়ার্ক যাচাই করুন।');
        }
      }
    );

    // Listener 2: Owner-scoped Cloud Notes
    const notesPath = `users/${uid}/notes`;
    const notesQuery = query(collection(db, 'users', uid, 'notes'), where('ownerId', '==', uid));
    const unsubNotes = onSnapshot(
      notesQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<CloudNoteRecord, 'id'>) }))
          .sort((a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));
        setCloudNotes(list);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, notesPath);
        } catch {
          toast('error', 'ক্লাউড নোট লোড ব্যর্থ', 'অনুমতি বা নেটওয়ার্ক যাচাই করুন।');
        }
      }
    );

    // Listener 3: Platform Cloud Announcements (published for all users, all for bootstrap admin)
    const annQuery = isBootAdmin
      ? collection(db, 'announcements')
      : query(collection(db, 'announcements'), where('status', '==', 'published'));
    const unsubAnnouncements = onSnapshot(
      annQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<CloudAnnouncementRecord, 'id'>) }))
          .sort((a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));
        setCloudAnnouncements(list);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'announcements');
        } catch {
          toast('error', 'ক্লাউড ঘোষণা লোড ব্যর্থ', 'অনুমতি যাচাই করুন।');
        }
      }
    );

    return () => {
      unsubInst();
      unsubBackups();
      unsubNotes();
      unsubAnnouncements();
    };
  }, [authReady, firebaseUser, toast]);

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      toast('success', 'Google (Firebase) সংযুক্ত হয়েছে', 'রিয়েল-টাইম ক্লাউড সিঙ্ক ও ব্যাকআপ সক্রিয় হয়েছে।');
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') return;
      toast('error', 'Google সাইন-ইন ব্যর্থ', err?.message || 'পপআপ ব্লক থাকলে অনুমতি দিন।');
    }
  }, [toast]);

  const signOutFirebase = useCallback(async () => {
    try {
      await signOut(auth);
      toast('info', 'Firebase ক্লাউড থেকে বিচ্ছিন্ন হয়েছেন');
    } catch (err: any) {
      toast('error', 'সাইন-আউট ব্যর্থ', err?.message);
    }
  }, [toast]);

  const syncInstitutionToCloud = useCallback(
    async (input: {
      institutionCode: string;
      name: string;
      status: 'active' | 'draft' | 'pending' | 'suspended';
      academicYear: string;
      studentCount: number;
      teacherCount: number;
      totalIncome: number;
      totalExpense: number;
    }): Promise<string> => {
      if (!firebaseUser) throw new Error('প্রথমে Google অ্যাকাউন্ট দিয়ে সংযুক্ত হোন।');
      const codeSlug = input.institutionCode.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'inst';
      const docId = `${firebaseUser.uid.slice(0, 12)}_${codeSlug}`.slice(0, BLUEPRINT_LIMITS.ID_MAX);
      const path = `institutions/${docId}`;
      const ref = doc(db, 'institutions', docId);
      const safeStatus = ['active', 'draft', 'pending', 'suspended'].includes(input.status)
        ? input.status
        : 'active';

      const payload = {
        name: clampString(input.name, BLUEPRINT_LIMITS.INSTITUTION_NAME_MAX) || 'মাদ্রাসা',
        status: safeStatus,
        academicYear: clampString(input.academicYear, 40),
        studentCount: Math.max(0, Math.min(1_000_000, Math.floor(Number(input.studentCount) || 0))),
        teacherCount: Math.max(0, Math.min(100_000, Math.floor(Number(input.teacherCount) || 0))),
        totalIncome: Math.max(0, Number(Number(input.totalIncome || 0).toFixed(2))),
        totalExpense: Math.max(0, Number(Number(input.totalExpense || 0).toFixed(2))),
        updatedAt: serverTimestamp(),
      };

      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            ownerId: firebaseUser.uid,
            institutionCode: clampString(input.institutionCode, 40) || codeSlug,
            ...payload,
            createdAt: serverTimestamp(),
          });
        } else {
          await updateDoc(ref, payload);
        }
        return docId;
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [firebaseUser]
  );

  const deleteCloudInstitution = useCallback(async (institutionId: string) => {
    const path = `institutions/${institutionId}`;
    try {
      await deleteDoc(doc(db, 'institutions', institutionId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }, []);

  const createCloudBackup = useCallback(
    async (input: {
      scope: 'platform' | 'institution';
      title: string;
      institutionName: string;
      recordCount: number;
      summaryText: string;
      exportedAtDhaka: string;
      metrics: Partial<BackupMetrics>;
      tags?: string[];
    }): Promise<string> => {
      if (!firebaseUser) throw new Error('প্রথমে Google অ্যাকাউন্ট দিয়ে সংযুক্ত হোন।');
      const backupId = sanitizeFirestoreId('bkp');
      const path = `cloudBackups/${backupId}`;
      const cleanTitle = clampString(input.title, BLUEPRINT_LIMITS.TITLE_MAX) || 'ডাটাবেস ব্যাকআপ';
      const cleanInst = clampString(input.institutionName, BLUEPRINT_LIMITS.INSTITUTION_NAME_MAX);
      const cleanSummary = clampString(input.summaryText, BLUEPRINT_LIMITS.BODY_MAX);
      const cleanDate = clampString(input.exportedAtDhaka, BLUEPRINT_LIMITS.EXPORTED_AT_MAX) || new Date().toISOString();
      const recordCount = Math.max(0, Math.min(10_000_000, Math.floor(Number(input.recordCount) || 0)));

      try {
        await setDoc(doc(db, 'cloudBackups', backupId), {
          ownerId: firebaseUser.uid,
          scope: input.scope === 'platform' ? 'platform' : 'institution',
          title: cleanTitle,
          institutionName: cleanInst,
          recordCount,
          status: 'active',
          summaryText: cleanSummary,
          exportedAtDhaka: cleanDate,
          metrics: sanitizeBackupMetrics(input.metrics),
          tags: sanitizeTags(input.tags || ['darul-idarah']),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return backupId;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [firebaseUser]
  );

  const archiveCloudBackup = useCallback(
    async (backupId: string) => {
      const path = `cloudBackups/${backupId}`;
      try {
        await updateDoc(doc(db, 'cloudBackups', backupId), {
          status: 'archived',
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    []
  );

  const deleteCloudBackup = useCallback(async (backupId: string) => {
    const path = `cloudBackups/${backupId}`;
    try {
      await deleteDoc(doc(db, 'cloudBackups', backupId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }, []);

  const createCloudNote = useCallback(
    async (input: {
      title: string;
      body: string;
      category: CloudNoteRecord['category'];
      tags?: string[];
    }): Promise<string> => {
      if (!firebaseUser) throw new Error('প্রথমে Google অ্যাকাউন্ট দিয়ে সংযুক্ত হোন।');
      const noteId = sanitizeFirestoreId('note');
      const path = `users/${firebaseUser.uid}/notes/${noteId}`;
      const title = clampString(input.title, BLUEPRINT_LIMITS.TITLE_MAX);
      const body = clampString(input.body, BLUEPRINT_LIMITS.BODY_MAX);
      if (!title || !body) throw new Error('নোটের শিরোনাম ও বিবরণ আবশ্যক।');

      try {
        await setDoc(doc(db, 'users', firebaseUser.uid, 'notes', noteId), {
          ownerId: firebaseUser.uid,
          title,
          body,
          category: input.category,
          status: 'open',
          tags: sanitizeTags(input.tags || []),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return noteId;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [firebaseUser]
  );

  const completeCloudNote = useCallback(
    async (noteId: string) => {
      if (!firebaseUser) return;
      const path = `users/${firebaseUser.uid}/notes/${noteId}`;
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid, 'notes', noteId), {
          status: 'done',
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [firebaseUser]
  );

  const deleteCloudNote = useCallback(
    async (noteId: string) => {
      if (!firebaseUser) return;
      const path = `users/${firebaseUser.uid}/notes/${noteId}`;
      try {
        await deleteDoc(doc(db, 'users', firebaseUser.uid, 'notes', noteId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [firebaseUser]
  );

  const createCloudAnnouncement = useCallback(
    async (input: {
      title: string;
      message: string;
      priority: CloudAnnouncementRecord['priority'];
      status: 'draft' | 'published';
    }): Promise<string> => {
      if (!firebaseUser) throw new Error('প্রথমে Google অ্যাকাউন্ট দিয়ে সংযুক্ত হোন।');
      const announcementId = sanitizeFirestoreId('ann');
      const path = `announcements/${announcementId}`;
      const title = clampString(input.title, BLUEPRINT_LIMITS.ANNOUNCEMENT_TITLE_MAX);
      const message = clampString(input.message, BLUEPRINT_LIMITS.BODY_MAX);
      if (!title || !message) throw new Error('ঘোষণার শিরোনাম ও বিবরণ আবশ্যক।');

      try {
        await setDoc(doc(db, 'announcements', announcementId), {
          authorId: firebaseUser.uid,
          title,
          message,
          priority: input.priority,
          status: input.status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return announcementId;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [firebaseUser]
  );

  const archiveCloudAnnouncement = useCallback(async (announcementId: string) => {
    const path = `announcements/${announcementId}`;
    try {
      await updateDoc(doc(db, 'announcements', announcementId), {
        status: 'archived',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }, []);

  const deleteCloudAnnouncement = useCallback(async (announcementId: string) => {
    const path = `announcements/${announcementId}`;
    try {
      await deleteDoc(doc(db, 'announcements', announcementId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }, []);

  return (
    <FirebaseContext.Provider
      value={{
        firebaseUser,
        authReady,
        profileReady,
        firestoreStatus,
        isFirebaseAdmin,
        cloudInstitutions,
        cloudBackups,
        cloudNotes,
        cloudAnnouncements,
        signInWithGoogle,
        signOutFirebase,
        syncInstitutionToCloud,
        deleteCloudInstitution,
        createCloudBackup,
        archiveCloudBackup,
        deleteCloudBackup,
        createCloudNote,
        completeCloudNote,
        deleteCloudNote,
        createCloudAnnouncement,
        archiveCloudAnnouncement,
        deleteCloudAnnouncement,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const ctx = useContext(FirebaseContext);
  if (!ctx) throw new Error('useFirebase must be used inside FirebaseProvider');
  return ctx;
}
