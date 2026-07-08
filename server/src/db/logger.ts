import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const LOGS_DIR = path.join(process.env.LOGS_DIR || "/opt/watch-together/logs");
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const db = new Database(path.join(LOGS_DIR, "activity.db"));

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT DEFAULT (datetime('now')),
    room_code TEXT,
    username TEXT,
    socket_id TEXT,
    event_type TEXT NOT NULL,
    event_data TEXT,
    ip TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_events_room ON events(room_code);
  CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);

  CREATE TABLE IF NOT EXISTS voice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    participants TEXT,
    duration_sec INTEGER
  );

  CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT DEFAULT (datetime('now')),
    room_code TEXT,
    username TEXT,
    source TEXT,
    message TEXT,
    stack TEXT,
    url TEXT,
    user_agent TEXT
  );
`);

// Buffered event writes for performance
const eventBuffer: { roomCode: string; username: string; socketId: string; eventType: string; eventData: string | null; ip: string | null }[] = [];

const insertEvent = db.prepare(
  "INSERT INTO events (room_code, username, socket_id, event_type, event_data, ip) VALUES (?, ?, ?, ?, ?, ?)"
);

const insertManyEvents = db.transaction((items: typeof eventBuffer) => {
  for (const item of items) {
    insertEvent.run(item.roomCode, item.username, item.socketId, item.eventType, item.eventData, item.ip);
  }
});

const insertError = db.prepare(
  "INSERT INTO errors (room_code, username, source, message, stack, url, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)"
);

const insertVoiceSession = db.prepare(
  "INSERT INTO voice_sessions (room_code, participants) VALUES (?, ?)"
);

const updateVoiceSession = db.prepare(
  "UPDATE voice_sessions SET ended_at = datetime('now'), duration_sec = ? WHERE id = ?"
);

export function logEvent(roomCode: string, username: string, socketId: string, eventType: string, eventData?: any, ip?: string) {
  try {
    eventBuffer.push({
      roomCode,
      username,
      socketId,
      eventType,
      eventData: eventData ? JSON.stringify(eventData) : null,
      ip: ip || null,
    });
  } catch (e) {
    console.error("logEvent buffer error:", e);
  }
}

function flushEvents() {
  if (eventBuffer.length === 0) return;
  const batch = eventBuffer.splice(0, eventBuffer.length);
  try {
    insertManyEvents(batch);
  } catch (e) {
    console.error("logEvent flush error:", e);
  }
}

// Flush buffered events every 5 seconds
setInterval(flushEvents, 5000);

export function logError(roomCode: string, username: string, source: string, message: string, stack?: string, url?: string, userAgent?: string) {
  try {
    insertError.run(roomCode, username, source, message, stack || null, url || null, userAgent || null);
  } catch (e) {
    console.error("logError error:", e);
  }
}

export function startVoiceSession(roomCode: string, participants: string[]): number {
  try {
    const result = insertVoiceSession.run(roomCode, JSON.stringify(participants));
    return result.lastInsertRowid as number;
  } catch (e) {
    console.error("startVoiceSession error:", e);
    return -1;
  }
}

export function endVoiceSession(sessionId: number, durationSec: number) {
  try {
    updateVoiceSession.run(durationSec, sessionId);
  } catch (e) {
    console.error("endVoiceSession error:", e);
  }
}

export function getLogs(roomCode?: string, limit = 100) {
  if (roomCode) {
    return db.prepare("SELECT * FROM events WHERE room_code = ? ORDER BY id DESC LIMIT ?").all(roomCode, limit);
  }
  return db.prepare("SELECT * FROM events ORDER BY id DESC LIMIT ?").all(limit);
}

export function getErrors(limit = 50) {
  return db.prepare("SELECT * FROM errors ORDER BY id DESC LIMIT ?").all(limit);
}

export function getVoiceSessions(roomCode?: string, limit = 50) {
  if (roomCode) {
    return db.prepare("SELECT * FROM voice_sessions WHERE room_code = ? ORDER BY id DESC LIMIT ?").all(roomCode, limit);
  }
  return db.prepare("SELECT * FROM voice_sessions ORDER BY id DESC LIMIT ?").all(limit);
}

// Cleanup old events (30 days TTL)
setInterval(() => {
  try {
    db.exec("DELETE FROM events WHERE ts < datetime('now', '-30 days')");
    db.exec("DELETE FROM errors WHERE ts < datetime('now', '-30 days')");
    db.exec("DELETE FROM voice_sessions WHERE started_at < datetime('now', '-30 days')");
  } catch (e) {
    console.error("Log cleanup error:", e);
  }
}, 3600000); // every hour
