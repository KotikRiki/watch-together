import pg from "pg";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data.json");

let pool: pg.Pool | null = null;
let usePostgres = false;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

// JSON fallback for local dev
let jsonDb: any = { rooms: [], messages: [], queue: [], uploads: [], video_history: [] };

function loadJsonDb() {
  if (fs.existsSync(DB_PATH)) {
    try { jsonDb = JSON.parse(fs.readFileSync(DB_PATH, "utf-8")); } catch { /* ignore */ }
  }
  if (!jsonDb.uploads) jsonDb.uploads = [];
  if (!jsonDb.video_history) jsonDb.video_history = [];
}

function saveJsonDb() {
  fs.writeFileSync(DB_PATH, JSON.stringify(jsonDb, null, 2));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
}

export async function query(text: string, params?: any[]) {
  if (usePostgres) {
    return getPool().query(text, params);
  }
  return jsonQuery(text, params);
}

// Simple SQL-to-JSON translator for local dev
function jsonQuery(text: string, params?: any[]): Promise<{ rows: any[] }> {
  return new Promise((resolve) => {
    loadJsonDb();
    const lower = text.toLowerCase().trim();

    if (lower.startsWith("create table")) {
      resolve({ rows: [] });
      return;
    }

    if (lower.startsWith("create index")) {
      resolve({ rows: [] });
      return;
    }

    // SELECT COUNT(*) FROM ...
    const countMatch = lower.match(/select count\(\*?\) ?::?int as cnt from (\w+)(?: where (.+))?/);
    if (countMatch) {
      const table = jsonDb[countMatch[1]] || [];
      let filtered = table;
      // Simple WHERE support
      if (countMatch[2]) {
        // Very basic filtering - just return all for now
        filtered = table;
      }
      resolve({ rows: [{ cnt: filtered.length }] });
      return;
    }

    // SELECT ... FROM rooms WHERE code = $1
    if (lower.includes("from rooms") && lower.includes("where code =")) {
      const codeParam = params?.[0];
      const room = jsonDb.rooms.find((r: any) => r.code === codeParam);
      resolve({ rows: room ? [room] : [] });
      return;
    }

    // SELECT ... FROM rooms WHERE id = $1
    if (lower.includes("from rooms") && lower.includes("where id =")) {
      const idParam = params?.[0];
      const room = jsonDb.rooms.find((r: any) => r.id === idParam);
      resolve({ rows: room ? [room] : [] });
      return;
    }

    // SELECT * FROM rooms
    if (lower.includes("select") && lower.includes("from rooms") && !lower.includes("where")) {
      resolve({ rows: jsonDb.rooms || [] });
      return;
    }

    // SELECT ... FROM messages WHERE room_id = $1
    if (lower.includes("from messages") && lower.includes("room_id")) {
      const roomId = params?.[0];
      const msgs = (jsonDb.messages || []).filter((m: any) => m.room_id === roomId);
      resolve({ rows: msgs });
      return;
    }

    // SELECT ... FROM queue WHERE room_id = $1
    if (lower.includes("from queue") && lower.includes("room_id")) {
      const roomId = params?.[0];
      const items = (jsonDb.queue || []).filter((q: any) => q.room_id === roomId);
      resolve({ rows: items });
      return;
    }

    // SELECT ... FROM uploads WHERE room_id = $1
    if (lower.includes("from uploads") && lower.includes("room_id")) {
      const roomId = params?.[0];
      const items = (jsonDb.uploads || []).filter((u: any) => u.room_id === roomId);
      resolve({ rows: items });
      return;
    }

    // SELECT ... FROM video_history WHERE room_id = $1
    if (lower.includes("from video_history") && lower.includes("room_id")) {
      const roomId = params?.[0];
      const items = (jsonDb.video_history || []).filter((v: any) => v.room_id === roomId);
      resolve({ rows: items });
      return;
    }

    // SELECT ... FROM video_history
    if (lower.includes("from video_history") && !lower.includes("where")) {
      resolve({ rows: jsonDb.video_history || [] });
      return;
    }

    // INSERT INTO rooms
    if (lower.startsWith("insert into rooms")) {
      const id = params?.[0];
      const code = params?.[1];
      const videoUrl = params?.[2];
      jsonDb.rooms.push({ id, code, video_url: videoUrl, views: 0, total_messages: 0, created_at: new Date().toISOString(), last_active: new Date().toISOString() });
      saveJsonDb();
      resolve({ rows: [] });
      return;
    }

    // INSERT INTO messages
    if (lower.startsWith("insert into messages")) {
      const [id, roomId, author, text] = params || [];
      jsonDb.messages.push({ id, room_id: roomId, author, text, created_at: new Date().toISOString() });
      saveJsonDb();
      resolve({ rows: [] });
      return;
    }

    // INSERT INTO queue
    if (lower.startsWith("insert into queue")) {
      const [id, roomId, url, title, sortOrder] = params || [];
      jsonDb.queue.push({ id, room_id: roomId, url, title, sort_order: sortOrder });
      saveJsonDb();
      resolve({ rows: [] });
      return;
    }

    // INSERT INTO uploads
    if (lower.startsWith("insert into uploads")) {
      const [id, roomId, filename, originalName, size, uploadedBy] = params || [];
      jsonDb.uploads.push({ id, room_id: roomId, filename, original_name: originalName, size, uploaded_by: uploadedBy, created_at: new Date().toISOString() });
      saveJsonDb();
      resolve({ rows: [] });
      return;
    }

    // INSERT INTO video_history
    if (lower.startsWith("insert into video_history")) {
      const [roomId, url, changedBy] = params || [];
      jsonDb.video_history.push({ id: (jsonDb.video_history?.length || 0) + 1, room_id: roomId, url, changed_by: changedBy, created_at: new Date().toISOString() });
      saveJsonDb();
      resolve({ rows: [] });
      return;
    }

    // UPDATE rooms SET views = views + 1
    if (lower.includes("set views = views + 1")) {
      const code = params?.[0];
      const room = jsonDb.rooms.find((r: any) => r.code === code);
      if (room) { room.views = (room.views || 0) + 1; room.last_active = new Date().toISOString(); }
      saveJsonDb();
      resolve({ rows: [] });
      return;
    }

    // UPDATE rooms SET video_url = $1
    if (lower.includes("set video_url =")) {
      const [videoUrl, code] = params || [];
      const room = jsonDb.rooms.find((r: any) => r.code === code);
      if (room) { room.video_url = videoUrl; room.last_active = new Date().toISOString(); }
      saveJsonDb();
      resolve({ rows: [] });
      return;
    }

    // UPDATE rooms SET total_messages = total_messages + 1
    if (lower.includes("set total_messages = total_messages + 1")) {
      const id = params?.[0];
      const room = jsonDb.rooms.find((r: any) => r.id === id);
      if (room) { room.total_messages = (room.total_messages || 0) + 1; room.last_active = new Date().toISOString(); }
      saveJsonDb();
      resolve({ rows: [] });
      return;
    }

    // UPDATE rooms SET views = 0, total_messages = 0
    if (lower.includes("set views = 0")) {
      (jsonDb.rooms || []).forEach((r: any) => { r.views = 0; r.total_messages = 0; });
      saveJsonDb();
      resolve({ rows: [] });
      return;
    }

    // DELETE FROM messages
    if (lower.startsWith("delete from messages")) { jsonDb.messages = []; saveJsonDb(); resolve({ rows: [] }); return; }
    if (lower.startsWith("delete from uploads")) { jsonDb.uploads = []; saveJsonDb(); resolve({ rows: [] }); return; }
    if (lower.startsWith("delete from queue")) { jsonDb.queue = []; saveJsonDb(); resolve({ rows: [] }); return; }
    if (lower.startsWith("delete from video_history")) { jsonDb.video_history = []; saveJsonDb(); resolve({ rows: [] }); return; }

    // DELETE FROM queue WHERE id = $1
    if (lower.startsWith("delete from queue") && lower.includes("where id")) {
      const id = params?.[0];
      jsonDb.queue = (jsonDb.queue || []).filter((q: any) => q.id !== id);
      saveJsonDb();
      resolve({ rows: [] });
      return;
    }

    // DELETE FROM rooms WHERE code = $1
    if (lower.startsWith("delete from rooms")) {
      const code = params?.[0];
      jsonDb.rooms = (jsonDb.rooms || []).filter((r: any) => r.code !== code);
      saveJsonDb();
      resolve({ rows: [] });
      return;
    }

    // ON CONFLICT DO NOTHING
    if (lower.includes("on conflict do nothing")) {
      resolve({ rows: [] });
      return;
    }

    // Fallback
    resolve({ rows: [] });
  });
}

export async function initDB() {
  if (process.env.DATABASE_URL) {
    usePostgres = true;
    const client = await getPool().connect();
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
        CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
      `);
      console.log("Database initialized (PostgreSQL)");
    } finally {
      client.release();
    }
  } else {
    usePostgres = false;
    loadJsonDb();
    console.log("Database initialized (JSON fallback - local dev)");
  }
}

export { pool, usePostgres };
