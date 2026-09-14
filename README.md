# 方境 Blockfrontier 1.1.0

独立的桌面浏览器体素沙盒游戏：程序化地形、挖掘建造、昼夜、生物、长矛战斗和本地存档。纹理由代码生成。不是 Minecraft 官方产品。

当前交付状态：**1.1.0 基线已验收；后续触控板调整已构建，真实浏览器回归待完成**。验证记录见 `RELEASE-VALIDATION.md`。

## 本地运行

要求 Node.js 22.12+。推荐 Node.js 22 LTS。

```bash
npm ci
npm run build
npm start
```

打开 `http://127.0.0.1:5173`。开发时可用 `npm run dev`。

- W/S 前进、后退，A/D 左右移动；空格跳跃，Shift 疾跑。
- 左键删除准星方块或攻击；右键/F 放置，按住可连续放置。
- 数字键 1–8 或点击物品栏切换物品；8 为长矛；7 为铜灯。触控板滑动和滚轮不切换物品。
- 黄色单面框可放置，红框说明位置被占用、碰到玩家或超出边界。
- G 打开世界向导；Esc 暂停。浏览器不支持鼠标锁定时，拖动鼠标转向。
- 夜怪最多 3 只，黎明消散并恢复少量生命；没有合成、背包数量和多人联机系统。

## 存档与恢复

世界按种子保存在浏览器 localStorage，每 10 秒自动保存，页面隐藏/离开时也尝试保存。暂停菜单可手动保存、导出 JSON 备份；主菜单可导入备份，覆盖同种子前会确认。

存档属于当前浏览器和来源地址。`localhost` 与 `127.0.0.1`、不同端口/域名不共享存档。迁移地址前先导出备份。清除浏览器数据会删除存档。

旧格式可以读取。损坏或不兼容的存档不会被静默覆盖；存储满或被禁用时会提示，可导出后主动放弃未保存进度。检测到其他页面改写存档后会停止覆盖；本实现没有跨设备同步，多页面并发仍建议只保留一个游戏窗口。

## 世界向导

默认提供本地规则建议，不需要 AWS。在线向导是可选功能，使用 Amazon Bedrock Runtime Converse；保持原有 global profile 配置，不使用 Mantle。

```bash
GUIDE_ENABLED=true AWS_REGION=us-east-1 \
BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-6 npm start
```

启用时使用 AWS SDK 默认凭证链；需在实际部署账户确认模型权限和可用性。未启用、离线或超时时，客户端降级为本地建议。测试使用注入的假提供者，不会调用收费模型。

限流：每客户端 6 次/分钟、每进程总计 60 次/小时、最多 2 个同时请求，服务端 15 秒超时。限流为单实例内存状态，进程重启会重置；多实例或面向大量用户开放在线向导时，需要在入口增加共享限流/身份验证和预算控制。默认不信任代理提供的客户端 IP；反向代理下会按代理地址共享限额。

## 验证

```bash
npm run check                    # 单元/接口测试、完整 TypeScript 检查、客户端和服务端构建
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e                  # 对生产构建运行真实浏览器测试
npm run release:check            # 上述检查 + 全依赖漏洞审计
```

浏览器测试自动启动 `127.0.0.1:5184`；需要系统允许启动浏览器进程。报告位于 `playwright-report/` 和 `work/e2e-results.json`，失败保留截图/trace。基线版本已完成 30 分钟稳定性检查，用户已确认转向、挖放与音效正常。后续禁用滚动切换物品栏的调整尚待浏览器回归，详见验收记录。

`.github/workflows/release.yml` 已提供 Linux/Node 22 的持续集成配置。推送及拉取请求将触发该流程；执行结果请查看仓库 Actions。

## 生产部署

构建阶段安装完整依赖，运行阶段只需 `dist/`、`dist-server/`、`package.json`、`package-lock.json` 和生产依赖：

```bash
npm ci --omit=dev
NODE_ENV=production HOST=127.0.0.1 PORT=5173 node dist-server/index.js
```

运行阶段不需要 Vite、TypeScript、tsx 或 Playwright。健康检查为 `GET /api/health`；在线向导离线不影响基础游戏健康。HTML 每次重新验证，带哈希的 assets 缓存一年并 gzip 压缩；缺失资源返回 404。

Dockerfile 提供非 root 的多阶段镜像配方，尚未在本机执行 Docker 验证。公网发布应在 HTTPS 反向代理后运行并保持同一来源提供页面与 API。首次发布前必须让浏览器门禁通过；本地服务启动成功不代表线上发布完成。

新旧发布切换时原子替换版本目录，并保留上一版带哈希的静态资源一段时间，避免已打开的页面遇到资源 404。回滚整个客户端/服务端版本；存档 v1 兼容原始未版本化格式，操作前仍建议导出备份。
