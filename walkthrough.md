# Security Summary

During the application-wide repair, optimization, and security review of Brainstine, the Express API server, authentication and welcome email pipelines, document extraction/summarization/PDF export modules, RAG retrieval services, assessment engine, and React UI components were audited and hardened across the stack.

### Verified Fixes Applied

1. **Restricted Cross-Origin Resource Sharing (Strict CORS Allowlist)**
   - **Risk**: `/server/createApiApp.ts` previously allowed any origin ending in `.vercel.app`, which permitted unrelated third-party `.vercel.app` deployments to make cross-origin requests against Brainstine API endpoints.
   - **Remediation**: Removed the blanket `.vercel.app` suffix allow rule in `isOriginAllowed`, retaining exact host matching (`Host` / `X-Forwarded-Host`), explicitly configured origins (`APP_URL`, `VITE_APP_URL`, `ALLOWED_ORIGINS`), deployment-scoped Vercel system URLs (`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`), and non-production loopback hosts. Untrusted preflight `OPTIONS` requests return HTTP `403` without `Access-Control-Allow-Origin`.

2. **Authenticated Diagnostic Health Probes**
   - **Risk**: `/api/health?probe=1` executed live upstream AI and Supabase REST schema probes for anonymous callers.
   - **Remediation**: Kept `GET /api/health` lightweight for availability monitoring while gating `?probe=1` diagnostics behind valid Supabase Bearer authentication (`resolveAuthorizedUserFromBearer`) when Supabase is configured (or denying unauthenticated probes in production), returning HTTP `401` to anonymous callers.

3. **OAuth Status Probe SSRF & Redirect Target Hardening**
   - **Risk**: `/api/auth/oauth-status` accepted an arbitrary `redirectTo` query parameter and followed redirect `Location` headers without strict protocol/host verification.
   - **Remediation**: Validated `req.query.redirectTo` against `isOriginAllowed(rawRedirectTo, req)` before forwarding to Supabase Auth, and enforced `https:` host checks (`accounts.google.com` or the configured Supabase project host) prior to outbound probe requests.

4. **Server-Side Cryptographic & API Key Isolation**
   - **Risk**: `/server/geminiService.ts` read `process.env.VITE_GEMINI_API_KEY` as a server fallback, and `/server/assessmentService.ts` fell back to a static salt string when `ASSESSMENT_KEY_SECRET` was missing or weak.
   - **Remediation**: Restricted server Gemini credentials strictly to `GEMINI_API_KEY` / `GOOGLE_API_KEY`, and replaced the static fallback literal with a process-scoped CSPRNG key (`crypto.randomBytes(32)`) while logging a production startup warning if `ASSESSMENT_KEY_SECRET` is missing or weak.

5. **Strict Host Validation for Staged File Retrieval & RAG Isolation**
   - Validated staged `signedStorageUrl` targets in `/api/materials/extract` against the configured Supabase host while blocking loopback, private, and link-local hosts.
   - Blocked unauthenticated caller-supplied `studyMaterials` spoofing in `chatRagService.ts` and `tutorRagService.ts` whenever Supabase authentication is active.
   - Maintained sealed server-side assessment answer keys (`correctOptionIndex` and `expectedAnswer` never exposed before submission), bounded question/answer validation, and atomic single-delivery dedupe for `/api/auth/welcome-email`.

6. **Client & Application-Wide Reliability Fixes**
   - Upgraded `/src/lib/pdfExport.ts` and `/src/components/SummaryDisplay.tsx` to preserve all summary sections (`sourceNotice`, `Concept Clarifications`, definitions, formulas, comparison tables, visual summaries, recaps, and takeaways), render `Page X of Y` footers with orphan-heading prevention and exact UTF-8 byte `xref` offsets, extend mobile object-URL lifetimes (`30s`), and show PDF download feedback.
   - Fixed keyboard double-flip/button conflicts in `/src/components/DocumentFlashcardsModal.tsx`, isolated non-blocking study activity logging in `/src/components/StudySummarizer.tsx`, added `Escape` dismissal across modals/drawers/pickers (`DashboardLayout.tsx`, `AuthModal.tsx`, `SummaryVisualBlock.tsx`, `AiTutorWorkspace.tsx`, `AiChatWorkspace.tsx`), added keyboard navigation to interactive SVG diagram nodes (`EducationalDiagramRenderer.tsx`), replaced `innerHTML` clearing with `replaceChildren()` (`BrainstineBrainCanvas.tsx`), added phone-account support in `ProfileSettingsView.tsx`, updated `PrivacyPolicyPage.tsx` disclosures, aligned `AuthModal` dark surface consistency with `WelcomePage`, and included `public/brainstine-logo.png` in `/vercel.json` serverless function packaging.

7. **Dependency & Residual Considerations**
   - `bun audit` reported 2 moderate advisories in transitive build-time dependencies (`glob` and `minimatch`) under `vite-plugin-pwa > workbox-build`; zero runtime application dependencies reported advisories.
   - Browser-rendered academic content uses React JSX (`AcademicContentRenderer.tsx`) without `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function`.
   - Live transactional welcome email delivery in production requires configuring `RESEND_API_KEY` and `WELCOME_EMAIL_FROM` (verified domain sender) in deployment environment variables, alongside Supabase and `ASSESSMENT_KEY_SECRET`.

---

## PoC Verification

All checks below were executed against the final repaired codebase and passed with exit code `0`:

1. **Integration & Security Test Suite (`npx tsx server/qaIntegrationTest.ts` — 31/31 Passed)**
   - **Strict CORS Rejection (Tests 2 & 29)**: Verified untrusted origins including `https://evil-tenant-app.vercel.app` receive HTTP `403` on `OPTIONS` preflight and zero `Access-Control-Allow-Origin` header, while configured `APP_URL` passes with `204`.
   - **Diagnostic Probe Auth Gate (Test 30)**: Verified anonymous `GET /api/health` returns `200`, anonymous `GET /api/health?probe=1` returns `401` when Supabase auth is active, and authenticated Bearer requests succeed with `200`.
   - **SSRF & Secret Isolation (Tests 3, 11, 13)**: Verified foreign Supabase hosts and loopback IPs are blocked (`400`), unauthenticated RAG `studyMaterials` spoofing returns `0` passages, and weak/missing `ASSESSMENT_KEY_SECRET` values operate via ephemeral sealing without secret leaks.
   - **Persistent Assessments & Concurrency (Tests 7–20)**: Verified Practice Mode lock/feedback survival, Timed Exam countdown survival across server restarts, expired auto-submission, completed session lock (`409`), and concurrent double-submission protection (`200` + `409`).
   - **Document Summarizer & Welcome Email (Tests 21–28)**: Verified section extraction, section subset summarization, unreadable content rejection (`422`), exact HTML/plaintext template escaping, logo PNG rendering with graceful fallback, authenticated `welcome-email` trigger (`401` unauthenticated), phone-only skip without email invention, and concurrent dedupe.
   - **Multi-Page Academic PDF Export (Test 31)**: Verified `buildSummaryPdfBytes()` generates a valid `%PDF-1.4` multi-page document (4 pages) ending in `xref` / `%%EOF` with `Page 1 of 4`..`Page 4 of 4` footers and full section coverage (`sourceNotice`, formulas, tables, `Concept Clarifications`).

2. **Supporting Engine & RAG Suites + Serverless Bundle**
   - `npx tsx server/documentEngineTest.ts`: passed.
   - `npx tsx server/summaryEngineTest.ts`: passed.
   - `npx tsx server/quizEngineTest.ts`: passed.
   - `npx tsx server/chatRagTest.ts`: passed.
   - `npx tsx server/tutorRagTest.ts`: passed.
   - `npx esbuild api/index.ts --bundle --platform=node --format=esm --outfile=/dev/null`: bundled cleanly (`6.0mb`).
