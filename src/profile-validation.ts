export const MAX_DISPLAY_NAME_LENGTH = 32;

export function normalizeDisplayName(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Name must be a string");
  }

  const name = value.trim();
  if (!name) throw new Error("Name is required");
  if (Array.from(name).length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(`Name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters`);
  }
  return name;
}
