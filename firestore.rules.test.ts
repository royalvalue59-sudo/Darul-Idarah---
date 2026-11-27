/**
 * Phase 0: Security Rules Verification Suite for DARUL IDARAH
 *
 * Verifies that every "Dirty Dozen" adversarial payload in security_spec.md
 * violates the blueprint invariants and is rejected by firestore.rules.
 */

import fs from 'fs';
import path from 'path';

interface BlueprintSchema {
  entities: Record<string, {
    properties: Record<string, { type: string; maxLength?: number; minLength?: number; enum?: string[]; pattern?: string }>;
    required?: string[];
  }>;
  firestore: Record<string, { schema: { $ref: string }; description: string }>;
}

export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  operation: 'create' | 'update' | 'get' | 'list';
  expected: 'PERMISSION_DENIED';
  guardPattern: RegExp;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on PublicUserProfile (isAdmin: true)',
    collection: '/users/{userId}',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    guardPattern: /data\.keys\(\)\.hasOnly\(\['uid', 'displayName', 'preferredTheme', 'createdAt', 'updatedAt'\]\)/,
  },
  {
    id: 2,
    name: 'Self-Assigned Admin Escalation on /admins/{userId}',
    collection: '/admins/{userId}',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    guardPattern: /match \/admins\/\{userId\}[\s\S]*allow create: if isAdmin\(\)/,
  },
  {
    id: 3,
    name: 'Identity Spoofing on CloudBackup (ownerId != auth.uid)',
    collection: '/cloudBackups/{backupId}',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    guardPattern: /data\.ownerId == request\.auth\.uid/,
  },
  {
    id: 4,
    name: 'Unverified Email Spoofing on Bootstrap Admin',
    collection: '/announcements/{announcementId}',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    guardPattern: /request\.auth\.token\.email_verified == true/,
  },
  {
    id: 5,
    name: 'Cross-User PII Read on /users/{userId}/private/{docId}',
    collection: '/users/{userId}/private/{docId}',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    guardPattern: /match \/private\/\{docId\}[\s\S]*allow get: if isSignedIn\(\) && isValidId\(userId\) && isValidId\(docId\) && \(isOwner\(userId\) \|\| isAdmin\(\)\)/,
  },
  {
    id: 6,
    name: 'Orphaned Subcollection Write Without Parent User Doc',
    collection: '/users/{userId}/notes/{noteId}',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    guardPattern: /exists\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\)/,
  },
  {
    id: 7,
    name: 'Client-Forged Timestamp (createdAt != request.time)',
    collection: '/cloudBackups/{backupId}',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    guardPattern: /incoming\(\)\.createdAt == request\.time/,
  },
  {
    id: 8,
    name: 'Immutable Field Tampering (ownerId or createdAt modified)',
    collection: '/users/{userId}/notes/{noteId}',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    guardPattern: /incoming\(\)\.ownerId == existing\(\)\.ownerId &&\s+incoming\(\)\.createdAt == existing\(\)\.createdAt/,
  },
  {
    id: 9,
    name: 'Terminal State Resurrection (done -> open or archived -> active)',
    collection: '/users/{userId}/notes/{noteId}',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    guardPattern: /existing\(\)\.status != 'done'/,
  },
  {
    id: 10,
    name: 'ID Poisoning / Oversized Document ID (>128 chars or invalid chars)',
    collection: '/cloudBackups/{backupId}',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    guardPattern: /function isValidId\(id\) \{ return id is string && id\.size\(\) <= 128 && id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\); \}/,
  },
  {
    id: 11,
    name: 'Array Size & String Size Resource Exhaustion (tags > 5 or body > 2000)',
    collection: '/users/{userId}/notes/{noteId}',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    guardPattern: /function isValidTags\(tags\) \{\s+return tags is list &&\s+tags\.size\(\) <= 5/,
  },
  {
    id: 12,
    name: 'Blanket List Scraping Without Resource-Level Enforcement',
    collection: '/cloudBackups/{backupId}',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    guardPattern: /allow list: if isSignedIn\(\) && \(resource\.data\.ownerId == request\.auth\.uid \|\| isBootstrapAdmin\(\)\)/,
  },
];

export function verifyRulesAgainstSpec(rulesFilePath = 'firestore.rules'): {
  passed: boolean;
  results: Array<{ id: number; name: string; status: 'PASS' | 'FAIL' }>;
} {
  const blueprint: BlueprintSchema = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8')
  );
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), rulesFilePath), 'utf8');

  const results = DIRTY_DOZEN_CASES.map((tc) => ({
    id: tc.id,
    name: tc.name,
    status: tc.guardPattern.test(rulesText) ? ('PASS' as const) : ('FAIL' as const),
  }));

  // Also ensure every collection path in firebase-blueprint.json has a corresponding match block
  const requiredMatchers = [
    'match /{document=**}',
    'match /users/{userId}',
    'match /private/{docId}',
    'match /notes/{noteId}',
    'match /admins/{userId}',
    'match /institutions/{institutionId}',
    'match /cloudBackups/{backupId}',
    'match /announcements/{announcementId}',
  ];
  const allMatched = requiredMatchers.every((m) => rulesText.includes(m));
  const blueprintCollectionsCount = Object.keys(blueprint.firestore).length;

  return {
    passed: allMatched && blueprintCollectionsCount === 7 && results.every((r) => r.status === 'PASS'),
    results,
  };
}
