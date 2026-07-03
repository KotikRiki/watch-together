import { Router } from "express";

export const stickersRouter = Router();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

export const packCache: Record<string, any> = {};

const ADMIN_USER = process.env.ADMIN_USER || "Admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "HeCJB/O4du[v1gGt";

function adminAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Admin"');
    return res.status(401).json({ error: "Unauthorized" });
  }
  const decoded = Buffer.from(authHeader.split(" ")[1], "base64").toString();
  const [user, pass] = decoded.split(":");
  if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.setHeader("WWW-Authenticate", 'Basic realm="Admin"');
  return res.status(401).json({ error: "Invalid credentials" });
}

stickersRouter.get("/file", async (req, res) => {
  const url = req.query.url as string;
  if (!url || !url.startsWith("https://api.telegram.org/")) {
    return res.status(400).json({ error: "Invalid url" });
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return res.status(404).json({ error: "Not found" });
    const ct = response.headers.get("content-type") || "video/webm";
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=86400");
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch {
    res.status(500).json({ error: "Proxy failed" });
  }
});

stickersRouter.get("/:packName", async (req, res) => {
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: "Telegram bot token not configured" });
  }

  const { packName } = req.params;

  if (packCache[packName]) {
    return res.json(packCache[packName]);
  }

  try {
    const setResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getStickerSet?name=${encodeURIComponent(packName)}`
    );
    const setData: any = await setResponse.json();

    if (!setData.ok) {
      return res.status(404).json({ error: setData.description || "Sticker set not found" });
    }

    const stickers = setData.result.stickers || [];

    const stickerData = await Promise.all(
      stickers.map(async (sticker: any) => {
        try {
          const fileResponse = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${sticker.file_id}`
          );
          const fileData: any = await fileResponse.json();

          if (fileData.ok && fileData.result.file_path) {
            const telegramUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
            const proxyUrl = `/api/stickers/file?url=${encodeURIComponent(telegramUrl)}`;
            return {
              url: proxyUrl,
              emoji: sticker.emoji || "",
              file_id: sticker.file_id,
              width: sticker.width,
              height: sticker.height,
              is_animated: !!sticker.is_animated,
              is_video: !!sticker.is_video,
            };
          }
        } catch {}
        return null;
      })
    );

    const result = {
      name: setData.result.name,
      title: setData.result.title,
      stickers: stickerData.filter(Boolean),
    };

    packCache[packName] = result;
    res.json(result);
  } catch (error) {
    console.error("Sticker fetch error:", error);
    res.status(500).json({ error: "Failed to fetch sticker set" });
  }
});

// Admin endpoints
stickersRouter.get("/admin/list", adminAuth, (_req, res) => {
  const packs = Object.keys(packCache).map((name) => ({
    name,
    title: packCache[name].title,
    stickerCount: packCache[name].stickers?.length || 0,
  }));
  res.json({ packs, botTokenConfigured: !!BOT_TOKEN });
});

stickersRouter.post("/admin/clear", adminAuth, (_req, res) => {
  const count = Object.keys(packCache).length;
  Object.keys(packCache).forEach((key) => delete packCache[key]);
  res.json({ success: true, cleared: count });
});

stickersRouter.post("/admin/load", adminAuth, async (req, res) => {
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: "Telegram bot token not configured" });
  }
  const { packName } = req.body;
  if (!packName) return res.status(400).json({ error: "packName required" });

  try {
    delete packCache[packName];
    const setResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getStickerSet?name=${encodeURIComponent(packName)}`
    );
    const setData: any = await setResponse.json();
    if (!setData.ok) return res.status(404).json({ error: setData.description || "Not found" });

    const stickers = setData.result.stickers || [];
    const stickerData = await Promise.all(
      stickers.map(async (sticker: any) => {
        try {
          const fileResponse = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${sticker.file_id}`
          );
          const fileData: any = await fileResponse.json();
          if (fileData.ok && fileData.result.file_path) {
            const telegramUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
            const proxyUrl = `/api/stickers/file?url=${encodeURIComponent(telegramUrl)}`;
            return {
              url: proxyUrl,
              emoji: sticker.emoji || "",
              file_id: sticker.file_id,
              width: sticker.width,
              height: sticker.height,
              is_animated: !!sticker.is_animated,
              is_video: !!sticker.is_video,
            };
          }
        } catch {}
        return null;
      })
    );

    const result = {
      name: setData.result.name,
      title: setData.result.title,
      stickers: stickerData.filter(Boolean),
    };

    packCache[packName] = result;
    res.json({ success: true, pack: { name: result.name, title: result.title, stickerCount: result.stickers.length } });
  } catch (error) {
    res.status(500).json({ error: "Failed to load pack" });
  }
});

stickersRouter.delete("/admin/:packName", adminAuth, (req, res) => {
  const { packName } = req.params;
  if (packCache[packName]) {
    delete packCache[packName];
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Pack not in cache" });
  }
});
