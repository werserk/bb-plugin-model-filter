import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { parseSnapshot, type Snapshot } from "./preferences";

type Database = ReturnType<BbPluginApi["storage"]["database"]>;
export const PREFERENCE_MIGRATIONS = [
  "CREATE TABLE IF NOT EXISTS model_filter_preferences (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), document TEXT NOT NULL)",
];
export class RevisionConflictError extends Error {
  constructor(expected: number, actual: number) {
    super(
      `Preferences changed (expected revision ${expected}, current ${actual}). Reload before saving.`,
    );
  }
}

/** SQLite serializes CAS across overlapping requests and plugin generations. */
export class PreferencesStore {
  constructor(private readonly db: Database) {}
  read(): Snapshot {
    const row = this.db
      .prepare(
        "SELECT document FROM model_filter_preferences WHERE singleton=1",
      )
      .get() as { document: string } | undefined;
    if (!row) return { revision: 0, providers: {} };
    try {
      const document: unknown = JSON.parse(row.document);
      if (
        typeof document !== "object" ||
        document === null ||
        !("version" in document) ||
        document.version !== 1 ||
        !("snapshot" in document)
      )
        throw new Error("Unsupported stored preferences version");
      return parseSnapshot(document.snapshot);
    } catch (error) {
      throw new Error(
        `Cannot read stored preferences: ${error instanceof Error ? error.message : "Invalid document"}`,
      );
    }
  }
  checkRevision(expected: number): Snapshot {
    const snapshot = this.read();
    if (snapshot.revision !== expected)
      throw new RevisionConflictError(expected, snapshot.revision);
    return snapshot;
  }
  update(expected: number, providers: Snapshot["providers"]): Snapshot {
    return this.db
      .transaction(() => {
        const current = this.checkRevision(expected);
        const next = parseSnapshot({
          revision: current.revision + 1,
          providers,
        });
        this.db
          .prepare(
            "INSERT INTO model_filter_preferences (singleton, document) VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET document=excluded.document",
          )
          .run(JSON.stringify({ version: 1, snapshot: next }));
        return next;
      })
      .immediate();
  }
}
