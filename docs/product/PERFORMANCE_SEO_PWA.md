# 第 15 步：性能、SEO 与 PWA

## 检查范围与限制

- 线上取证页面：`https://scott33333345-hue.github.io/coastal-typhoon-watch/`
- 线上检查时间：2026-10-18
- 本地验收页面：首页、台风详情页、历史对比页
- 本地性能数字来自开发机与本地服务器，仅用于回归对比，不等同于真实用户 Core Web Vitals、搜索排名或流量数据。

## 线上旧版SEO取证

公开页面抓取状态为 HTTP 200，但仍是旧版界面。源码中确认存在：

- 标题：`海风哨｜台风实况与预警`
- 描述：`沿海台风实况与预警平台演示页面`
- 未声明 canonical；
- 未声明 Open Graph；
- 未发现 JSON-LD 结构化数据；
- 页面仍使用“演示页面”定位；
- 站点URL映射未发现其他页面。该结果只说明本次映射未返回URL，不能据此断言页面未被索引。

## 本地新版修复

### 性能

- 移除首屏同步加载的Leaflet CSS和脚本；
- 先渲染本地影响、数据时间与文字路径，再异步加载地图；
- 地图库失败或超时时继续显示文字时间线；
- Service Worker仅缓存本站页面外壳、公开数据和运行时地图资源；
- 发布新缓存版本时只删除本项目旧缓存，不影响同域其他项目。

### SEO

- 三个页面具有独立标题、描述和单一H1；
- 三个页面声明绝对 canonical、Open Graph 和Twitter卡片类型；
- 首页加入 `WebApplication` JSON-LD；
- 新增 `robots.txt` 与 `sitemap.xml`；
- 新增主题色、SVG站点图标和Manifest；
- 详情页查询参数统一到不含参数的规范地址，避免重复页面信号。

### PWA与离线安全

- 新增 `manifest.webmanifest`、`pwa.js` 与 `sw.js`；
- 页面外壳和最近一次公开数据可离线访问；
- 数据响应来自离线缓存时增加 `X-Coastal-Offline: true`；
- 首页和详情页明确显示“当前离线”和缓存抓取时间；
- 历史对比页离线时显示通用缓存提示；
- 离线缓存不会被描述为实时数据，也不缓存或生成官方预警判断。

## 自动验收结果

运行：

```powershell
node scripts/performance-seo-check.mjs
```

本地冷启动实验室结果：

| 指标 | 结果 |
| --- | ---: |
| DOMContentLoaded | 约162ms |
| 首次内容绘制 | 约180ms |
| 页面Load事件 | 约162ms |
| 首屏资源请求 | 13个 |
| 传输资源量 | 约71KB |
| Leaflet开始加载 | DOMContentLoaded之后 |

功能验收：

| 检查项 | 结果 |
| --- | --- |
| 三页标题、描述、canonical、OG | 通过 |
| 首页JSON-LD | 通过 |
| `robots.txt` | HTTP 200 |
| `sitemap.xml` | HTTP 200 |
| Manifest | HTTP 200 |
| Service Worker | 安装成功并接管离线页面 |
| 断网刷新 | 页面可打开 |
| 离线数据标识 | 显示“当前离线 · 显示缓存数据” |
| 无障碍回归 | 通过 |

## 发布后复核

本地修改尚未证明线上已更新。部署后需要重新抓取公开URL，检查线上源码、`robots.txt`、`sitemap.xml`、Manifest和Service Worker，并在真实移动网络环境补充性能与安装测试。
