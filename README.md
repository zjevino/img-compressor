# Pixel Press

纯静态图片压缩工具。JPG、PNG、WebP 的导入、编码、误差采样、预览和 ZIP 打包均在浏览器内执行，无后端和运行时外部请求。

## 本地运行与检查

需要 Node.js 22 或更高版本；浏览器测试默认使用本机 Microsoft Edge。

```powershell
npm ci
npm run build:css
npm run build
npm test
python -m http.server 8080 --directory dist --bind 127.0.0.1
```

打开 http://127.0.0.1:8080 。静态资源已随项目提供，部署时无需安装 Node.js。只有修改 HTML/JS 中的 Tailwind 类名后才需要重新生成 CSS。

没有 Edge 时，通过 `BROWSER_PATH` 指定已安装的 Chromium/Chrome 可执行文件。测试使用本地临时 HTTP 服务，检查压缩、格式、目标大小、异常恢复、并发、预览、多语言、下载 ZIP 和移动端布局；截图写入系统临时目录 `pixel-press-qa`，可用 `QA_OUTPUT` 更改位置。

## 部署

运行 `npm run build` 后，将 **dist 文件夹中的内容** 上传到任意静态站点平台。无须配置 SPA 回退、数据库、API Key 或环境密钥。使用 HTTPS，确认 HTML、JS、CSS、SVG 和 WOFF2 的 MIME 类型正确。不要只上传 index.html；必须保留 js、css（含 webfonts 和 vendor）目录及 favicon.svg、robots.txt。

域名尚未确定时，默认构建省略 canonical、og:url 和 sitemap，避免把占位地址提交给搜索引擎。确定域名后，例如：

```powershell
npm run build -- --origin=https://example.com
```

这会在 dist 内生成对应域名的 canonical、Open Graph URL、sitemap.xml 和 robots.txt。当前脚本面向域名根目录部署；若使用子目录，需要另行调整站点 URL。每次构建会重新生成 dist，请在源码修改后重新构建。

静态平台可配置 `X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`。如配置 CSP，当前界面使用行内事件与样式，应采用兼容策略，例如：

```text
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

上线后实际检查首页与资源状态、手机选图、单张下载、ZIP 下载、HTTPS 和正式域名的 SEO 标签。尚未绑定真实域名，本项目检查不包含生产环境 DNS、TLS 或平台缓存设置。

## 行为与边界

- 每个文件最大 50 MiB、3200 万像素；不支持或损坏文件会跳过，其余文件继续处理。大图解码依赖设备内存，批量任务顺序运行。
- 目标 KB 表示**不超过**所选上限，不会填充字节制造精确大小。必要时会降低分辨率；PNG 的大小滑块通过改变尺寸生效，浏览器 PNG 编码不支持有损质量参数。
- JPG 不支持透明，透明区域会合成为白色；PNG/WebP 保留透明。输出为静态图片，动画不会保留。重新编码不保留 EXIF 等原始元数据。
- RMSE 和最大误差在最长边 300 像素的采样图上计算，不能代表完整分辨率的所有细节。
- 当前自动加载两个内置演示样本；首次导入真实图片会替换演示样本。处理期间互斥操作会提示稍候，不会排队执行。
- 标准 ZIP（不支持 ZIP64），超过标准容量或条目限制会报错，不会生成溢出损坏的 ZIP。
- 已验证本机 Edge（Chromium）桌面与移动尺寸视口；尚未在真实 iOS Safari、Android 或 Firefox 上验收。

## 第三方资源

Font Awesome Free 6.5.1 已本地化，许可证见 `css/vendor/FONT-AWESOME-LICENSE.txt`。内置示例图的来源与授权未在原项目中记录，公开上线前请确认你拥有相应使用权；无法确认时应替换为有明确授权的样本。
