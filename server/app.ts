import express from "express";
import helmet from "helmet";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
import path from "node:path";

export type GuideProvider = (
  prompt: string, context: Record<string, unknown>, signal: AbortSignal,
) => Promise<string>;

export interface AppOptions {
  distDir?: string;
  guide?: GuideProvider;
  guideTimeoutMs?: number;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], connectSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"], upgradeInsecureRequests: null,
    } },
  }));
  app.use(compression());
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, res, next) => {
    if (req.method !== "GET" && req.get("sec-fetch-site") === "cross-site") {
      res.status(403).json({ error: "不接受跨站请求。" });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "16kb", strict: true }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, guide: options.guide ? "enabled" : "local" });
  });
  const limited = { error: "提问太频繁，请稍后再试。" };
  const perClient = rateLimit({
    windowMs: 60_000, limit: 6, standardHeaders: "draft-8",
    legacyHeaders: false, message: limited,
  });
  const globalBudget = rateLimit({
    windowMs: 3_600_000, limit: 60, keyGenerator: () => "guide-budget",
    standardHeaders: "draft-8", legacyHeaders: false, message: limited,
  });
  let inFlight = 0;
  app.post("/api/guide", perClient, globalBudget, async (req, res) => {
    const { prompt, context = {} } = req.body ?? {};
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 240 ||
        !context || typeof context !== "object" || Array.isArray(context) ||
        JSON.stringify(context).length > 4096) {
      res.status(400).json({ error: "问题或游戏状态格式无效。" });
      return;
    }
    if (!options.guide) {
      res.status(503).json({ error: "网络向导未启用，请使用本地建议。" });
      return;
    }
    if (inFlight >= 2) {
      res.set("Retry-After", "15").status(429).json(limited);
      return;
    }
    inFlight++;
    const controller = new AbortController();
    const disconnected = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once("close", disconnected);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("Guide deadline exceeded"));
        }, options.guideTimeoutMs ?? 15_000);
      });
      const text = await Promise.race([
        options.guide(prompt.trim(), context, controller.signal), deadline,
      ]);
      if (typeof text !== "string" || !text.trim()) throw new Error("Empty guide response");
      if (!res.destroyed) res.json({ text: text.slice(0, 2000) });
    } catch {
      if (!res.destroyed) res.status(503).json({ error: "世界向导暂时离线，请稍后再试。" });
    } finally {
      clearTimeout(timeout);
      res.off("close", disconnected);
      inFlight--;
    }
  });
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在。" }));
  if (options.distDir) {
    app.use("/assets", express.static(path.join(options.distDir, "assets"), {
      immutable: true, maxAge: "1y", fallthrough: false,
    }));
    app.get("/", (_req, res) => {
      res.set("Cache-Control", "no-cache").sendFile(path.join(options.distDir!, "index.html"));
    });
    app.use(express.static(options.distDir, { maxAge: 0, index: false }));
    app.use((_req, res) => res.status(404).type("text").send("Not found"));
  }
  app.use((error: { status?: number }, _req: express.Request, res: express.Response,
    _next: express.NextFunction) => {
    const status = error.status === 413 ? 413 : error.status === 404 ? 404 :
      error.status === 400 ? 400 : 500;
    res.status(status).json({ error: status === 413 ? "请求内容过大。" :
      status === 400 ? "请求格式错误。" : status === 404 ? "文件不存在。" : "服务暂时不可用。" });
  });
  return app;
}
