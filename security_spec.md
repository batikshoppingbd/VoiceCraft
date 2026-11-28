# Security Specification — VoiceCraft Studio (Authenticated, Profile & Admin RBAC)

## 1. Data Invariants
1. All access requires Firebase Authentication with a verified email (`request.auth != null && request.auth.token.email_verified == true`).
2. `systemConfig/adminSetup` is a write-once non-PII lock (`claimed: true`, `claimedAt`) created atomically with the very first user's `admins/{uid}` document. Once created, it cannot be updated or deleted.
3. Every document in `users/{userId}`, `settings/{userId}`, and `accountInfo/{userId}` can be read and updated only by its owner (`request.auth.uid == userId`) or an Admin (`users` / `settings` / `accountInfo` `list` is restricted to Admins). Users cannot escalate `role` or modify `status`.
4. `systemConfig/studio` stores platform-wide controls (`ttsEnabled`, `voiceCloningEnabled`, `maxTextLength`, `defaultLanguage`, `defaultFormat`) readable by verified users and mutable exclusively by Admins.
5. `voiceProfiles/{voiceId}`, `voiceSamples/{sampleId}`, `generatedAudios/{audioId}`, and `downloadedAudios/{downloadId}` enforce `userId == request.auth.uid` ownership, active user status (`status == 'active'`) on creation, immutable ownership fields on update, and verified parent document references (`voiceProfiles` -> `voiceSamples`, `voiceProfiles` -> `generatedAudios` -> `downloadedAudios`).
6. Firebase Storage paths `/voiceSamples/{userId}/{sampleFile}` and `/generatedAudios/{userId}/{audioFile}` enforce strict `request.auth.uid == userId`, verified email, `audio/*` content-type, and file-size bounds.
7. All document IDs match `^[a-zA-Z0-9_\-]+$` (max 128 chars), all strings have bounded `.size()`, and all timestamps equal `request.time`.

## 2. Adversarial Payloads ("Dirty Dozen")
1. **Unauthenticated read/write**: Attempt `get` on `/users/uid1` or `/settings/uid1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified email write**: Attempt `create` on `/voiceProfiles/v1` or `/settings/uid1` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **Self-assigned Admin escalation**: Non-first user attempts `create` on `/users/uid2` with `role: 'admin'` -> `PERMISSION_DENIED`.
4. **Role tampering on update**: Regular user updates `/users/uid2` changing `role` to `'admin'` or `status` to `'active'` -> `PERMISSION_DENIED`.
5. **Suspended user generation bypass**: User with `status: 'suspended'` attempts `create` on `/settings/uid2`, `/voiceProfiles/v2`, `/voiceSamples/s2`, or `/generatedAudios/g2` -> `PERMISSION_DENIED`.
6. **Cross-user settings/account theft**: User B attempts `get` or `update` on `/settings/uid1` or `/accountInfo/uid1` -> `PERMISSION_DENIED`.
7. **Orphaned voice sample creation**: User creates `/voiceSamples/s1` pointing to a `voiceId` owned by another user or non-existent -> `PERMISSION_DENIED`.
8. **Blanket user directory scraping**: Non-admin user runs `list` on `/users`, `/settings`, or `/accountInfo` -> `PERMISSION_DENIED`.
9. **Cross-user voice profile theft**: User B runs `get` or `list` on User A's `/voiceProfiles` -> `PERMISSION_DENIED`.
10. **Non-admin studio config tampering**: Regular user attempts `update` on `/systemConfig/studio` -> `PERMISSION_DENIED`.
11. **Shadow field injection**: User creates `/settings/uid2` with unlisted key `adminOverride: true` -> `PERMISSION_DENIED`.
12. **Client timestamp forgery / ID poisoning**: User submits backdated `createdAt`/`updatedAt` or `1KB` ID -> `PERMISSION_DENIED`.
