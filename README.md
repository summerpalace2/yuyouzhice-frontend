# 渝游智策 Web 前端

`web/` 是当前唯一的 Web UI 源码与 Netlify 发布目录。本地运行 `npm run dev` 与线上页面使用同一份原生 ESM 应用；浏览器请求保持为同源的 `/api/*` 和 `/images/*`，再由 Netlify 转发给 BFF。

## 高德地图配置

地图配置不放在 Netlify 前端环境变量中。浏览器通过 `/api/map-config` 从 BFF 获取 JS API 的公开加载参数，因此请在 **BFF 的 Zeabur 服务** 配置：

- `AMAP_WEB_JS_KEY`：高德控制台创建的“Web端（JS API）”Key。
- `AMAP_WEB_JS_SECURITY_CODE`：仅在该 Key 启用了安全密钥时填写。

同时在高德控制台的域名白名单中加入 `ggys.netlify.app`；本地调试再加入对应的 `localhost` 地址。不要把 Web 服务 Key、数据库密码或任意真实密钥提交到本仓库。
