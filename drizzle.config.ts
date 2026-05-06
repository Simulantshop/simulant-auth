import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/schema.ts", "./src/audit-schema.ts"],
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.SIMULANT_AUTH_DB_URL!,
    authToken: process.env.SIMULANT_AUTH_DB_TOKEN!,
  },
  verbose: true,
  strict: true,
});
