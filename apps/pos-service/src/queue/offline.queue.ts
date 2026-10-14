import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

export interface QueuedSale {
  id: number
  idempotency_key: string
  payload: string        // JSON stringified order payload
  attempts: number
  created_at: string
  last_error: string | null
}

export class OfflineQueue {
  private db: Database.Database

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sale_queue (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        idempotency_key  TEXT    NOT NULL UNIQUE,
        payload          TEXT    NOT NULL,
        attempts         INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
        last_error       TEXT
      );
    `)
  }

  enqueue(idempotencyKey: string, payload: unknown): number {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO sale_queue (idempotency_key, payload) VALUES (?, ?)'
    )
    const result = stmt.run(idempotencyKey, JSON.stringify(payload))
    return result.lastInsertRowid as number
  }

  peek(limit = 10): QueuedSale[] {
    return this.db
      .prepare('SELECT * FROM sale_queue WHERE attempts < 5 ORDER BY id ASC LIMIT ?')
      .all(limit) as QueuedSale[]
  }

  markSuccess(id: number): void {
    this.db.prepare('DELETE FROM sale_queue WHERE id = ?').run(id)
  }

  markFailed(id: number, error: string): void {
    this.db
      .prepare('UPDATE sale_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?')
      .run(error, id)
  }

  size(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM sale_queue').get() as { count: number }
    return row.count
  }
}
