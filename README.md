# 渝游智策 Web 前端

`web/` 是当前 Web UI 的权威源码；根目录 `src/` 还有一套 Vue SPA，但当前站点部署使用 `web/`。Netlify 和 Vercel 都运行 Vite 构建 `web/` 并发布 `web/dist/`，本地 `npm run dev` 也以 `web/` 为入口。浏览器请求保持为同源的 `/api/*` 和 `/images/*`，再由 Netlify 转发给 BFF。

## 高德地图配置

地图配置不放在 Netlify 前端环境变量中。浏览器通过 `/api/map-config` 从 BFF 获取 JS API 的公开加载参数，因此请在 **BFF 的 Zeabur 服务** 配置：

- `AMAP_WEB_JS_KEY`：高德控制台创建的“Web端（JS API）”Key。
- `AMAP_WEB_JS_SECURITY_CODE`：仅在该 Key 启用了安全密钥时填写。

同时在高德控制台的域名白名单中加入 `ggys.netlify.app`；本地调试再加入对应的 `localhost` 地址。不要把 Web 服务 Key、数据库密码或任意真实密钥提交到本仓库。
