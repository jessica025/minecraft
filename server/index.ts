import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createApp } from "./app";
import { createBedrockGuide } from "./guide";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
const distDir = path.join(rootDir, "dist");
if (isProduction && !existsSync(path.join(distDir, "index.html"))) {
  throw new Error("dist 目录不存在，请先运行 npm run build。");
}
const bedrock = process.env.GUIDE_ENABLED === "true" ? createBedrockGuide(
  process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? "us-east-1",
  process.env.BEDROCK_MODEL_ID ?? "global.anthropic.claude-sonnet-4-6",
) : undefined;
const app = createApp({ distDir: isProduction ? distDir : undefined, guide: bedrock?.provider });
let vite: { close: () => Promise<void> } | undefined;
if (!isProduction) {
  const { createServer } = await import("vite");
  const dev = await createServer({
    root: rootDir, server: { middlewareMode: true, hmr: false }, appType: "spa",
  });
  vite = dev;
  app.use(dev.middlewares);
}
const server = app.listen(port, host, () => {
  console.log(`Blockfrontier is running at http://${host}:${port}`);
});
server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
server.on("error", (error) => {
  console.error(`Blockfrontier failed to listen on ${host}:${port}`, error);
  bedrock?.dispose();
  void vite?.close();
  process.exitCode = 1;
});
let closing = false;
function shutdown(): void {
  if (closing) return;
  closing = true;
  server.close(() => {
    bedrock?.dispose();
    void vite?.close();
  });
  server.closeIdleConnections();
  setTimeout(() => {
    server.closeAllConnections();
    bedrock?.dispose();
  }, 16_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
