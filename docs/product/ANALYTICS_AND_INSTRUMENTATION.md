# 第 12 步：数据分析与埋点

## 目标

用匿名、仅保存在浏览器本机的事件验证用户是否完成了核心决策路径，同时避免收集救援行为和敏感位置数据。

## 北极星指标

**本地决策路径完成率**：在同一匿名会话中，用户成功读取数据、看到本地影响，并进一步查看路径、官方来源、台风详情、关注或分享中的至少一项。

计算口径：

1. `data_load_completed`
2. `local_impact_rendered`
3. 至少一个后续行动事件：`track_opened`、`official_source_opened`、`typhoon_detail_opened`、`follow_changed`、`share_completed`

## 关键事件

| 阶段 | 事件 | 用途 |
| --- | --- | --- |
| 访问 | `page_viewed` | 判断页面访问与设备视口 |
| 数据 | `data_load_completed` / `data_load_failed` | 判断数据链路是否可用 |
| 决策 | `local_impact_rendered` | 判断本地影响模块是否成功呈现 |
| 路径 | `track_opened` / `forecast_range_changed` / `timeline_toggled` | 判断路径信息是否被使用 |
| 深入 | `typhoon_detail_opened` / `historical_compare_opened` | 判断深入查看意图 |
| 核验 | `official_source_opened` | 判断用户是否进入权威渠道 |
| 留存 | `follow_changed` / `reminder_preferences_saved` | 判断关注与提醒意图 |
| 分享 | `share_started` / `share_completed` / `share_cancelled` / `share_failed` | 判断分享链路完成情况 |
| 回退 | `fallback_displayed` / `map_fallback_displayed` / `client_error_detected` | 发现数据、地图和客户端异常 |

## 隐私边界

- 事件仅写入当前浏览器 `localStorage`，不上传服务器；
- 匿名会话每 24 小时轮换；
- 最多保存最近 200 条事件；
- 不记录 IP、完整 User-Agent、自由文本或精确经纬度；
- 不记录 110、119、120、122、12395、12345 等电话链接点击；
- 属性经过白名单过滤，未声明字段不会写入。

## 本地调试

访问 `/?analytics=1` 显示本地调试面板。面板展示当前会话事件数、决策路径是否完成、异常事件数及事件明细，并支持清空本机记录。

## 验收标准

- 完成核心浏览路径后，面板显示“完成决策路径：是”；
- 刷新页面后本地事件仍存在；
- 超过 200 条时只保留最近 200 条；
- 紧急号码点击不产生事件；
- 页面不包含任何事件上报网络请求；
- 关闭 `analytics` 参数时不显示调试界面，不影响正常浏览。
