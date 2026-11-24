# Security Summary

During the Step 5 end-to-end integration and security review of Brainstine, the API server, retrieval services, and frontend client modules were audited for cross-origin exposure, server-side request forgery (SSRF), authentication/isolation bypasses, input validation gaps, and secret/provider leakage.

### Verified Fixes Applied

1. **Restricted Cross-Origin Resource Sharing (CORS Allowlist)**
   - **Risk**: `/server/createApiApp.ts` previously reflected any incoming `Origin` header back in `Access-Control-Allow-Origin` on all `/api/*` endpoints, allowing untrusted third-party sites to perform cross-origin requests against authenticated API routes.
   - **Remediation**: Replaced unconditional origin reflection with an allowlist validator (`isOriginAllowed`) permitting only same-host origins (`Host`/`X-Forwarded-Host`), explicitly configured deployment origins (`APP_URL`, `VITE_APP_URL`, `VERCEL_URL`, `ALLOWED_ORIGINS`), and loopback development hosts outside production. Untrusted `OPTIONS` preflight requests now receive HTTP `403` without `Access-Control-Allow-Origin`.

2. **Strict Host Validation for Staged File Retrieval (SSRF Prevention)**
   - **Risk**: In `/api/materials/extract`, `signedStorageUrl` checked `(expectedHost && host === expectedHost) || host.endsWith('.supabase.co')`, which permitted signed URLs pointing to unrelated external `.supabase.co` projects even when the application's Supabase host was configured.
   - **Remediation**: Enforced exact hostname matching against `expectedHost` whenever Supabase is configured, restricted fallback wildcard `.supabase.co` checks strictly to unconfigured environments, and explicitly blocked loopback/private/link-local hostnames (`localhost`, `127.0.0.1`, `::1`, `10.*`, `172.16-31.*`, `192.168.*`, `169.254.*`, `.local`, `.internal`).

3. **Authenticated RAG Material Isolation**
   - **Risk**: In `/server/chatRagService.ts` and `/server/tutorRagService.ts`, unauthenticated requests could supply `studyMaterials` along with a client-provided `userId` even when live Supabase authentication was active.
   - **Remediation**: Blocked caller-supplied `studyMaterials` indexing whenever Supabase is configured and the request lacks a valid verified Bearer token. Also added a cache bypass check when an explicitly attached document ID is absent from the short-lived per-user cache.

4. **Server-Side Input Bounds on Quiz Grading**
   - **Risk**: `/api/quizzes/grade` accepted unbounded `questions` arrays, unvalidated `selectedOptionIndex` / `correctOptionIndex` bounds, and uncapped `maxMarks` / `timeTakenSeconds` values.
   - **Remediation**: Enforced a hard cap of `70` questions per submission, validated option arrays and integer index bounds (returning HTTP `400` for out-of-range selections or malformed questions), and clamped `maxMarks` (`1..20`), written `textResponse` length (`8,000` chars), and `timeTakenSeconds` (`0..14,400`).

5. **Client Technical Error Scrubbing**
   - **Risk**: `CLIENT_TECHNICAL_LEAK_PATTERNS` in `/src/lib/apiClient.ts` scrubbed Gemini identifiers and `AIza...` keys, but did not catch Groq identifiers or `gsk_...` key prefixes.
   - **Remediation**: Added `/groq/i`, `/groq_api_key/i`, and `/gsk_[a-z0-9_-]{10,}/i` to `CLIENT_TECHNICAL_LEAK_PATTERNS`.

6. **Dependency & Residual Considerations**
   - `bun audit` reported 2 moderate advisories in transitive build-time dependencies (`glob@11.1.0` and `minimatch@10.2.6, 5.1.9`) under `vite-plugin-pwa > workbox-build`; no runtime application dependencies reported advisories.
   - Browser-rendered academic markdown runs through React JSX (`AcademicContentRenderer.tsx`) without `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function`, and `EducationalDiagramRenderer.tsx` now filters non-finite coordinates before rendering SVG plots.
   - Quiz answer keys (`correctOptionIndex` / `expectedAnswer`) are currently included in client session state to support stateless/saved assessment review; separating grading keys entirely server-side requires authenticated server-persisted quiz storage.

---

## PoC Verification

All checks below were executed locally against the updated codebase via `npx tsx server/qaIntegrationTest.ts` after all fixes were applied:

1. **CORS Allowlist Enforcement (Test 2 of 8)**
   - Sent `OPTIONS /api/health` with `Origin: https://evil-attacker.example` while `APP_URL=https://brainstine.example.com` -> verified status `403` and `Access-Control-Allow-Origin: null`.
   - Sent `GET /api/health` with `Origin: https://evil-attacker.example` -> verified `Access-Control-Allow-Origin: null`.
   - Sent `OPTIONS /api/health` with `Origin: https://brainstine.example.com` -> verified status `204` and exact origin allow header.

2. **SSRF Protection on `/api/materials/extract` (Test 3 of 8)**
   - Set `VITE_SUPABASE_URL=https://myproject.supabase.co` and submitted `signedStorageUrl: https://attacker-other.supabase.co/storage/v1/object/sign/study-materials/leak.pdf?token=abc` -> verified HTTP `400` rejection.
   - Submitted loopback URL `https://127.0.0.1/storage/v1/object/sign/study-materials/leak.pdf?token=abc` -> verified HTTP `400` rejection.

3. **Quiz Grading Input Bounds (Test 6 of 8)**
   - Submitted `selectedOptionIndex: 99` against 4-option objective question -> verified HTTP `400` rejection.
   - Submitted `71` questions to `POST /api/quizzes/grade` -> verified HTTP `400` rejection.

4. **Unauthenticated RAG Material Spoofing Protection (Test 7 of 8)**
   - Configured `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then called `buildChatRagContext()` and `buildTutorRagContext()` without a Bearer token while passing `userId: 'spoofed-victim-user-id'` and `studyMaterials` -> verified `searchedDocumentsCount === 0` and `sources.length === 0` in both services.

5. **Supporting Deterministic & RAG Suites**
   - `npx tsx server/documentEngineTest.ts`: 7/7 checks passed (including cross-user isolation).
   - `npx tsx server/summaryEngineTest.ts`: 5/5 checks passed.
   - `npx tsx server/chatRagTest.ts`: 8/8 checks passed.
   - `npx tsx server/tutorRagTest.ts`: 7/7 test groups passed (including HTTP/SSE validation).
