import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data.json");

let db: any = { rooms: [], messages: [], queue: [] };

export function initDB() {
  if (fs.existsSync(DB_PATH)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    } catch {
      db = { rooms: [], messages: [], queue: [] };
    }
  } else {
    saveDB();
  }
  console.log("Database initialized");
  return Promise.resolve();
}

export function getDB() {
  return db;
}

export function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
}
