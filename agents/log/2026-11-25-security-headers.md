# Security headers and their e2e assertions (T-016)

- Date: 2026-11-25
- Agent: codebuff
- Task: T-016
- Branch: `agent/security-headers`

## Goal

The app answered every route with no security headers: no CSP, no `frame-ancestors`, no
`Referrer-Policy`, no `Permissions-Policy`, no HSTS. The guest identity is a bearer cookie, so a
framed or script-injected page is a real risk once the URL is shared. Add the headers centrally and
pin them in the acceptance suite, including the part that is easy to get wrong: a CSP that blocks
Next's inline bootstrap scripts still serves HTML but never hydrates.

## Changed

- `next.config.mjs` — one `headers()` rule for `/:path*`:
  - `Content-Security-Policy`: `default-src 'self'`; `script-src 'self' 'unsafe-inline'`
    (`'unsafe-eval'` added in dev); `style-src 'self' 'unsafe-inline'`; `img-src`/`font-src`
    self + `data:`; `connect-src 'self'` (plus `ws: wss:` in dev for HMR); `object-src 'none'`;
    `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`.
  - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
    `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying
    camera/microphone/geolocation/payment/usb, `Cross-Origin-Opener-Policy: same-origin`,
    `X-DNS-Prefetch-Control: off`.
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` in production only.
- `e2e/security.spec.ts` (new) — asserts each header on a page response and on `/api/health`,
  asserts HSTS is absent in the HTTP dev suite, then clicks through to `/metrics` (client
  navigation only works if React hydrated) and requires zero CSP console errors.
- `ARCHITECTURE.md` — a hardening bullet in §8 and ADR-11 recording the `'unsafe-inline'`
  trade-off and why nonce middleware is deferred.
- `README.md` — not changed; no command, env var or deploy step moved.

## Verified

- `npm run typecheck` → exit 0.
- `npm test` → exit 0, 48/48 in 6 files.
- `npm run build` → exit 0.
- `npm run test:e2e` → see the run recorded in the PR/commit; includes the new security spec plus
  the existing acceptance scenario, so header changes did not break generation, the assistant,
  preview/apply, persistence, roles or mobile.

## Not verified

- HSTS on the real deployment: it is production-only and this suite runs the dev server over
  HTTP. The header is asserted absent here; its presence on Render is unverified until T-002.
- The CSP trade-off: inline script is still allowed. No nonce, so a stored script-injection bug
  would not be mitigated by CSP — the app has no `dangerouslySetInnerHTML`, which is the reason
  this is acceptable for now.
- Headers on `next start` were not fetched separately; `next build` succeeded and `headers()` is the
  same function in both modes apart from dev-only CSP additions and HSTS.

## Next step

Deploy (T-002) and fetch `-I https://…/` once to confirm the CSP and HSTS values survive Render's
proxy. If a third-party script is ever added, the CSP needs a nonce and the ADR needs revisiting.

## Open questions

- Should `frame-ancestors 'none'` be relaxed to allow a future embed? It is deliberately strict;
  embedding Kanso elsewhere would need an allowlist.
- Is `'unsafe-inline'` in `style-src` avoidable? React and Next write style attributes, so not
  without a nonce/hash pass over generated markup.
