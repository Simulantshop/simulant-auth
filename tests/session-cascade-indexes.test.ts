import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../drizzle/0002_oauth_session_cascade_indexes.sql", import.meta.url), "utf8");

test.each(["CASCADE", "SET NULL"])("session cleanup avoids child scans and preserves %s semantics", (sessionDelete) => {
  const db = new Database(":memory:");
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE session(id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
      CREATE INDEX session_expiresAt_idx ON session(expires_at);
      CREATE TABLE oauth_refresh_token(id TEXT PRIMARY KEY, session_id TEXT REFERENCES session(id) ON DELETE ${sessionDelete});
      CREATE TABLE oauth_access_token(id TEXT PRIMARY KEY, session_id TEXT REFERENCES session(id) ON DELETE ${sessionDelete}, refresh_id TEXT REFERENCES oauth_refresh_token(id) ON DELETE CASCADE);
      INSERT INTO session VALUES ('expired', 1), ('active', 100);
      INSERT INTO oauth_refresh_token VALUES ('old-refresh', 'expired'), ('live-refresh', 'active');
      INSERT INTO oauth_access_token VALUES ('old-access', 'expired', 'old-refresh'), ('live-access', 'active', 'live-refresh');`);
    const plans = (sql: string) => (db.query(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map(r => r.detail).join("\n");
    expect(plans("DELETE FROM session WHERE expires_at < 50")).toContain("SCAN oauth_access_token");
    expect(plans("DELETE FROM session WHERE expires_at < 50")).toContain("SCAN oauth_refresh_token");
    db.exec(migration);
    db.exec(migration); // Deployment retries must be harmless.
    const sessionPlan = plans("DELETE FROM session WHERE expires_at < 50");
    expect(sessionPlan).not.toMatch(/SCAN oauth_(access|refresh)_token/);
    expect(sessionPlan).toContain("oauth_access_token_sessionId_idx");
    expect(sessionPlan).toContain("oauth_refresh_token_sessionId_idx");
    expect(plans("DELETE FROM oauth_refresh_token WHERE id = 'old-refresh'")).toContain("oauth_access_token_refreshId_idx");
    db.exec("DELETE FROM session WHERE expires_at < 50");
    expect(db.query("SELECT id FROM session").all()).toEqual([{ id: "active" }]);
    expect(db.query("SELECT id, session_id FROM oauth_access_token WHERE id='live-access'").get()).toEqual({ id: "live-access", session_id: "active" });
    expect(db.query("SELECT id, session_id FROM oauth_refresh_token WHERE id='old-refresh'").get()).toEqual(sessionDelete === "CASCADE" ? null : { id: "old-refresh", session_id: null });
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    db.close();
  }
});
