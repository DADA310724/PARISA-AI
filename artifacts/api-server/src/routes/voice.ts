import { Router } from "express";
import type { Request, Response } from "express";
import { MsEdgeTTS, OUTPUT_FORMAT, ProsodyOptions } from "msedge-tts";

const router = Router();

const FEMALE_VOICE = "bn-BD-NabanitaNeural";
const MALE_VOICE   = "bn-BD-PradeepNeural";

function cleanText(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, " ")
    .replace(/[\u{2600}-\u{26FF}]/gu, " ")
    .replace(/[\u{2700}-\u{27BF}]/gu, " ")
    .replace(/[*_#~`|\\[\]{}^<>=@+]/g, " ")
    .replace(/\[IMAGE:[^\]]*\]/g, " ")
    .replace(/\.{2,}/g, " ")
    .replace(/\n{2,}/g, "। ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

router.post("/voice", async (req: Request, res: Response) => {
  try {
    const { text, gender } = req.body as { text?: string; gender?: string };
    if (!text || !text.trim()) {
      res.status(204).end();
      return;
    }

    const { speed } = req.body as { text?: string; gender?: string; speed?: number };
    const voiceName = gender === "male" ? MALE_VOICE : FEMALE_VOICE;
    const cleaned = cleanText(text).slice(0, 2000);
    if (!cleaned.trim()) {
      res.status(204).end();
      return;
    }

    const prosody = new ProsodyOptions();
    prosody.rate = Math.min(Math.max(Number(speed) || 1.0, 0.5), 2.0);

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache");

    const audioStream = tts.toStream(cleaned, prosody);

    audioStream.on("error", (err: Error) => {
      console.error("TTS stream error:", err.message);
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });

    audioStream.pipe(res);
  } catch (err: unknown) {
    const e = err as Error;
    console.error("Voice route error:", e.message);
    if (!res.headersSent) res.status(500).end();
  }
});

export default router;
