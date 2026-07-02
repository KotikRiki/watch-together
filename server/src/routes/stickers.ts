import { Router } from "express";

export const stickersRouter = Router();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

stickersRouter.get("/:packName", async (req, res) => {
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: "Telegram bot token not configured" });
  }

  const { packName } = req.params;

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
            const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
            return {
              url,
              emoji: sticker.emoji || "",
              file_id: sticker.file_id,
              width: sticker.width,
              height: sticker.height,
              is_animated: sticker.type === "animated",
              is_video: sticker.type === "video",
            };
          }
        } catch {}
        return null;
      })
    );

    res.json({
      name: setData.result.name,
      title: setData.result.title,
      stickers: stickerData.filter(Boolean),
    });
  } catch (error) {
    console.error("Sticker fetch error:", error);
    res.status(500).json({ error: "Failed to fetch sticker set" });
  }
});
