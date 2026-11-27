# DARUL IDARAH — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants & Master Source of Truth

1. **Default-Deny Catch-All**: Every path not explicitly matched is rejected (`allow read, write: if false;`).
2. **Verified Identity Mandate**: Every write operation requires an authenticated user with `request.auth.token.email_verified == true`.
3. **PII Isolation (Split Collection)**:
   - `/users/{userId}` holds only non-PII display preferences (`uid`, `displayName`, `preferredTheme`, `createdAt`, `updatedAt`). No `email`, `phone`, `role`, or `isAdmin` fields are allowed.
   - `/users/{userId}/private/{docId}` holds PII (`email`, `photoURL`, linked account metadata) and is readable/writable ONLY by `isOwner(userId)` or `isAdmin()`, and requires the parent `/users/{userId}` document to exist (Master Gate).
4. **Master Gate on Subcollections**:
   - `/users/{userId}/private/{docId}` and `/users/{userId}/notes/{noteId}` MUST verify `exists(/databases/$(database)/documents/users/$(userId))` on single-document operations so revoked or missing parent profiles cannot hold orphaned sub-documents.
5. **Immutable Identity & Server Timestamps**:
   - `uid`, `ownerId`, `authorId`, and `createdAt` are immutable after creation.
   - `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
6. **Terminal State Locking**:
   - `CloudBackup.status == 'archived'`, `CloudNote.status == 'done'`, and `CloudAnnouncement.status == 'archived'` are terminal states that non-admins cannot mutate after reaching terminal status.
7. **Zero-Cost-Explosion List Queries**:
   - `allow list` rules NEVER call `get()` or `exists()`. They validate `resource.data` directly (`resource.data.ownerId == request.auth.uid`, or `resource.data.status == 'published'`).
8. **Strict Schema & Size Enforcement**:
   - Every string checks `.size()` against exact `firebase-blueprint.json` limits.
   - Every ID matches `^[a-zA-Z0-9_\-]+$` and `<= 128` chars.
   - Every array (`tags`) enforces `.size() <= 5` and element type/length guards.
   - Every create checks `keys().hasAll(...) && keys().hasOnly(...)`; every update checks `isValid[Entity](incoming())` FIRST plus `incoming().diff(existing()).affectedKeys().hasOnly(...)`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)

1. **Shadow Field Injection on Public Profile (`POST /users/u1`)**:
   ```json
   { "uid": "u1", "displayName": "User", "preferredTheme": "light", "isAdmin": true, "createdAt": "<serverTime>", "updatedAt": "<serverTime>" }
   ```
2. **Self-Assigned Admin Escalation (`POST /admins/attacker`)**:
   ```json
   { "uid": "attacker", "label": "Super Admin", "grantedBy": "attacker", "createdAt": "<serverTime>" }
   ```
3. **Identity Spoofing on Cloud Backup (`POST /cloudBackups/b1` as `u1` with `ownerId: "victim"`)**:
   ```json
   { "ownerId": "victim", "scope": "institution", "title": "Spoof", "institutionName": "M1", "recordCount": 5, "status": "active", "summaryText": "x", "exportedAtDhaka": "24-11-2026", "metrics": { "institutions": 0, "users": 1, "students": 1, "teachers": 1, "transactions": 0, "notices": 0 }, "tags": ["a"], "createdAt": "<serverTime>", "updatedAt": "<serverTime>" }
   ```
4. **Unverified Admin Email Spoofing (`POST /announcements/a1` with `email: "royalvalue59@gmail.com"`, `email_verified: false`)**:
   ```json
   { "authorId": "spoof", "title": "Fake Notice", "message": "Spoofed", "priority": "urgent", "status": "published", "createdAt": "<serverTime>", "updatedAt": "<serverTime>" }
   ```
5. **Cross-User PII Read (`GET /users/victim/private/info` as `u1`)**:
   - Non-owner, non-admin read of isolated PII document.
6. **Orphaned Note Write Without Parent Profile (`POST /users/u1/notes/n1` when `/users/u1` does not exist)**:
   ```json
   { "ownerId": "u1", "title": "Orphan", "body": "No parent", "category": "general", "status": "open", "tags": [], "createdAt": "<serverTime>", "updatedAt": "<serverTime>" }
   ```
7. **Client-Forged Timestamp (`POST /cloudBackups/b2` with `createdAt: "2020-01-01T00:00:00Z"`)**:
   - Fails `incoming().createdAt == request.time`.
8. **Immutable Field Tampering (`PATCH /users/u1/notes/n1` modifying `ownerId` or `createdAt`)**:
   ```json
   { "ownerId": "other", "createdAt": "<newTime>" }
   ```
9. **Terminal State Resurrection (`PATCH /users/u1/notes/n1` changing `status` from `"done"` back to `"open"` as non-admin)**:
   ```json
   { "status": "open", "updatedAt": "<serverTime>" }
   ```
10. **ID Poisoning / Resource Exhaustion (`POST /cloudBackups/<200-char-invalid-id$!>`)**:
    - Fails `isValidId(backupId)` regex and length (`<= 128`).
11. **Oversized Array / Value Poisoning (`POST /users/u1/notes/n2` with 6 tags or 3000-char `body`)**:
    ```json
    { "ownerId": "u1", "title": "Huge", "body": "<3000 chars>", "category": "general", "status": "open", "tags": ["1","2","3","4","5","6"], "createdAt": "<serverTime>", "updatedAt": "<serverTime>" }
    ```
12. **Blanket List Scraping (`LIST /cloudBackups` without `where('ownerId', '==', auth.uid)` or `LIST /announcements` including drafts as regular user)**:
    - Rejected because `allow list` validates `resource.data.ownerId == request.auth.uid` and `resource.data.status == 'published'`.
