# Security Specification — VoiceCraft Studio (Authenticated & Admin RBAC)

## 1. Data Invariants
1. All access requires Firebase Authentication with a verified email (`request.auth != null && request.auth.token.email_verified == true`).
2. `systemConfig/adminSetup` is a write-once non-PII lock (`claimed: true`, `claimedAt`) created atomically with the very first user's `admins/{uid}` document. Once created, it cannot be updated or deleted.
3. Every document in `users/{userId}` can be read by its owner or an Admin; directory listing (`list`) is restricted exclusively to Admins. Regular users cannot set `role: 'admin'` on creation unless bootstrapping the one-time first-user admin lock or matching the verified runtime admin email, and users can never escalate `role` or change `status` on update.
4. `systemConfig/studio` stores platform-wide controls (`ttsEnabled`, `voiceCloningEnabled`, `maxTextLength`, `defaultLanguage`, `defaultFormat`) readable by verified users and mutable exclusively by Admins.
5. `voiceProfiles/{voiceId}`, `generatedAudios/{audioId}`, and `downloadedAudios/{downloadId}` enforce `userId == request.auth.uid` ownership, active user status (`status == 'active'`) on creation, immutable ownership fields on update, and verified parent document references (`voiceProfiles` -> `generatedAudios` -> `downloadedAudios`).
6. All document IDs match `^[a-zA-Z0-9_\-]+$` (max 128 chars), all strings have bounded `.size()`, and all timestamps equal `request.time`.

## 2. Adversarial Payloads ("Dirty Dozen")
1. **Unauthenticated read/write**: Attempt `get` on `/users/uid1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified email write**: Attempt `create` on `/voiceProfiles/v1` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **Self-assigned Admin escalation**: Non-first user attempts `create` on `/users/uid2` with `role: 'admin'` -> `PERMISSION_DENIED`.
4. **Role tampering on update**: Regular user updates `/users/uid2` changing `role` to `'admin'` or `status` to `'active'` -> `PERMISSION_DENIED`.
5. **Suspended user generation bypass**: User with `status: 'suspended'` attempts `create` on `/voiceProfiles/v2` or `/generatedAudios/g2` -> `PERMISSION_DENIED`.
6. **Admin takeover via `adminSetup` overwrite**: User attempts `update` or `create` on `/systemConfig/adminSetup` when it already exists -> `PERMISSION_DENIED`.
7. **Unauthorized `admins` write**: Non-admin user attempts `create` on `/admins/uid2` after bootstrap is claimed -> `PERMISSION_DENIED`.
8. **Blanket user directory scraping**: Non-admin user runs `list` on `/users` -> `PERMISSION_DENIED`.
9. **Cross-user voice profile theft**: User B runs `get` or `list` on User A's `/voiceProfiles` -> `PERMISSION_DENIED`.
10. **Non-admin studio config tampering**: Regular user attempts `update` on `/systemConfig/studio` -> `PERMISSION_DENIED`.
11. **Shadow field injection**: User creates `/users/uid2` with unlisted key `credits: 999999` -> `PERMISSION_DENIED`.
12. **Client timestamp forgery / ID poisoning**: User submits backdated `createdAt` or `1KB` ID -> `PERMISSION_DENIED`.
