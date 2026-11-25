---
"bponder": patch
"create-bponder": patch
"bponder-client": patch
"bponder-react": patch
---

Fixed a bug that caused `bun add bponder@1.0.6` to fail with `bponder-utils@workspace:* failed to resolve`. The published tarball had concrete versions, but registry metadata still listed `workspace:*` because `postpack` restored the manifest before npm uploaded it. Restore now runs after publish (`postpublish`), not before registry metadata is sent.
