const DEFAULT_LOGIN_URL = "https://login.simulant.shop";

function isLocalhostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  } catch {
    return false;
  }
}

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.COOLIFY_CONTAINER_NAME !== undefined ||
    process.env.COOLIFY_FQDN !== undefined
  );
}

export function publicLoginBaseUrl(): string {
  const configured = process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "");
  if (!configured) return DEFAULT_LOGIN_URL;

  if (isProductionRuntime() && isLocalhostUrl(configured)) {
    console.error(
      `[@simulant/auth] BETTER_AUTH_URL is '${configured}' in a production runtime. ` +
        `Using ${DEFAULT_LOGIN_URL} for public email/auth links.`,
    );
    return DEFAULT_LOGIN_URL;
  }

  return configured;
}

export function publicAuthUrl(input: string): string {
  if (!isProductionRuntime() || !isLocalhostUrl(input)) {
    return input;
  }

  try {
    const url = new URL(input);
    const base = new URL(publicLoginBaseUrl());
    url.protocol = base.protocol;
    url.hostname = base.hostname;
    url.port = base.port;
    return url.toString();
  } catch {
    return input;
  }
}
