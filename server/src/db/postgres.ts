import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id VARCHAR(20) PRIMARY KEY,
        code VARCHAR(6) UNIQUE NOT NULL,
        video_url TEXT,
        views INT DEFAULT 0,
        total_messages INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_active TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(20) PRIMARY KEY,
        room_id VARCHAR(20) REFERENCES rooms(id) ON DELETE CASCADE,
        author VARCHAR(100) NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS queue (
        id VARCHAR(20) PRIMARY KEY,
        room_id VARCHAR(20) REFERENCES rooms(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        title TEXT,
        sort_order INT DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS uploads (
        id VARCHAR(20) PRIMARY KEY,
        room_id VARCHAR(20) REFERENCES rooms(id) ON DELETE SET NULL,
        filename TEXT NOT NULL,
        original_name TEXT,
        size BIGINT DEFAULT 0,
        uploaded_by VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS video_history (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(20) REFERENCES rooms(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        changed_by VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_queue_room_id ON queue(room_id);
      CREATE INDEX IF NOT EXISTS idx_uploads_room_id ON uploads(room_id);
      CREATE INDEX IF NOT EXISTS idx_video_history_room_id ON video_history(room_id);
      CREATE INDEX IF NOT EXISTS idx_video_history_created_at ON video_history(created_at);
      CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
    `);
    console.log("Database initialized (PostgreSQL)");
  } finally {
    client.release();
  }
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
}

export { pool };
