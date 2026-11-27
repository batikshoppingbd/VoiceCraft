# Security Specification — VoiceCraft Studio

## 1. Data Invariants
1. Every document in `users/{userId}` can only be read or mutated by the verified authenticated user whose `request.auth.uid == userId`.
2. Every `voiceProfiles/{voiceId}` document requires `userId == request.auth.uid`, `ownershipVerified == true`, and a valid `consentStatement` at creation time. Ownership (`userId`, `sampleAudioId`, `ownershipVerified`, `verifiedAt`, `createdAt`) cannot be reassigned after creation.
3. Every `generatedAudios/{audioId}` document must reference an existing `voiceProfiles/{voiceId}` document owned by `request.auth.uid`.
4. Every `downloadedAudios/{downloadId}` document must reference an existing `generatedAudios/{generatedAudioId}` document owned by `request.auth.uid`.
5. No collection permits unauthenticated access, unverified-email writes, blanket `list` reads without `resource.data.userId == request.auth.uid`, or shadow/unlisted fields.
6. All document IDs are strictly validated (`^[a-zA-Z0-9_\-]+$`, max 128 chars), and all timestamps (`createdAt`, `updatedAt`, `verifiedAt`, `downloadedAt`) must equal `request.time`.

## 2. Adversarial Payloads ("Dirty Dozen")
1. **Unauthenticated read/write**: Attempt `get` on `/users/uid1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified email write**: Attempt `create` on `/voiceProfiles/v1` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **Cross-user voice profile read**: User B attempts `get` on User A's `/voiceProfiles/v1` -> `PERMISSION_DENIED`.
4. **Blanket list query**: User B attempts `list` on `/voiceProfiles` without `where('userId', '==', uidB)` -> `PERMISSION_DENIED`.
5. **Identity spoofing on create**: User B attempts `create` on `/voiceProfiles/v2` with `userId: uidA` -> `PERMISSION_DENIED`.
6. **Unverified voice cloning bypass**: User attempts `create` on `/voiceProfiles/v3` with `ownershipVerified: false` -> `PERMISSION_DENIED`.
7. **Shadow field injection**: User attempts `create` on `/users/uid1` with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
8. **Orphaned TTS record**: User creates `/generatedAudios/g1` referencing a non-existent or User A-owned `voiceId` -> `PERMISSION_DENIED`.
9. **Path ID poisoning**: User attempts `create` on `/voiceProfiles/bad$id!with/invalid` -> `PERMISSION_DENIED`.
10. **Client timestamp forgery**: User creates `/voiceProfiles/v4` with backdated `createdAt` not equal to `request.time` -> `PERMISSION_DENIED`.
11. **Immutable ownerId tampering on update**: User attempts `update` on `/voiceProfiles/v1` changing `userId` or `ownershipVerified` -> `PERMISSION_DENIED`.
12. **Value poisoning / resource exhaustion**: User attempts `update` on `/voiceProfiles/v1` with a 10KB `name` string -> `PERMISSION_DENIED`.
