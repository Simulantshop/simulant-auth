/**
 * Better Auth endpoint budgets.
 *
 * `/get-session` is an authenticated, read-only request used by every Simulant
 * app and by each PrestaShop frontend gate. The shop calls arrive through the
 * shared Coolify/Traefik egress address, so an IP-scoped limit must absorb a
 * synchronized school login without weakening any credential endpoint.
 */
export const AUTH_RATE_LIMIT_RULES = {
  "/get-session": { window: 60, max: 6_000 },
  "/sign-in/email": { window: 60, max: 5 },
  "/sign-up/email": { window: 60 * 60, max: 3 },
  "/forget-password": { window: 60 * 60, max: 3 },
  "/request-password-reset": { window: 60, max: 1 },
  "/sign-in/magic-link": { window: 60 * 60, max: 5 },
  "/email-otp/send-verification-otp": { window: 60 * 60, max: 5 },
  "/two-factor/verify": { window: 60, max: 5 },
} as const;
