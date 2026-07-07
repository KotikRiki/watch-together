import { Router, Request, Response } from "express";
import { logEvent, logError, getLogs, getErrors, getVoiceSessions } from "../db/logger";

export const loggerRouter = Router();

loggerRouter.post("/event", (req: Request, res: Response) => {
  const { roomCode, username, socketId, eventType, eventData, ip } = req.body;
  logEvent(roomCode, username, socketId, eventType, eventData, ip);
  res.json({ ok: true });
});

loggerRouter.post("/error", (req: Request, res: Response) => {
  const { roomCode, username, source, message, stack, url, userAgent } = req.body;
  logError(roomCode, username, source, message, stack, url, userAgent);
  res.json({ ok: true });
});

loggerRouter.get("/events", (req: Request, res: Response) => {
  const roomCode = req.query.room as string | undefined;
  const limit = parseInt(req.query.limit as string) || 100;
  res.json(getLogs(roomCode, limit));
});

loggerRouter.get("/errors", (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(getErrors(limit));
});

loggerRouter.get("/voice-sessions", (req: Request, res: Response) => {
  const roomCode = req.query.room as string | undefined;
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(getVoiceSessions(roomCode, limit));
});
