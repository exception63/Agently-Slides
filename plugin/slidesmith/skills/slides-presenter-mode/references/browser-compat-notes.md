# 浏览器兼容性 + 实战注意事项

> 实战中踩过的坑 · 部署到讲师机器前必读。

---

## 浏览器矩阵

| 浏览器 | 主屏 | 副屏 | 备注 |
|---|---|---|---|
| Safari 15.4+ macOS | ✅ | ✅ | iPad Sidecar 完美 |
| Safari 14 macOS / iPad | ⚠️ | ⚠️ | BroadcastChannel 不支持 · 退化到 localStorage（仍工作 · 5-50ms 延迟感知不到） |
| Chrome 90+ | ✅ | ✅ | 推荐 |
| Edge 90+ | ✅ | ✅ | |
| Firefox 90+ | ✅ | ✅ | iframe zoom 退化到 transform · 字号缩放可能轻微错位 |
| 老 WebView / IE11 | ❌ | ❌ | 不在支持范围 · 讲师机器升一下 |

---

## file:// 跨目录的 origin 行为

主屏在 `02-slides/fuquan0527.html` · 讲稿在 `01-讲稿/讲稿合集.html`：

| 浏览器 | 视为同 origin? | 影响 |
|---|---|---|
| Chrome（默认） | ❌ 不同 | contentDocument 访问被拦 · 必须 postMessage |
| Chrome `--allow-file-access-from-files` | ✅ | 都可用 · 但讲师机器一般不开这个 flag |
| Safari | 取决于设置 | "开发"菜单 → 禁止跨域限制 |
| Firefox | ❌ 不同 | 同 Chrome |

**结论**：永远假设跨域。永远用 postMessage。

---

## iPad 作副屏（Sidecar）

macOS 笔记本 + iPad 是讲师最常见组合：

1. macOS "系统设置 → 显示器" 加 iPad 为副屏（无线 / 数据线）
2. 主屏运行 slides HTML · 按"全屏播放"(F)
3. 点"🖥 演讲者"按钮 → 弹出副屏窗口
4. **手动拖**副屏窗口到 iPad 屏幕
5. 副屏可双指捏合调字号 · 但更可靠的是用副屏自己的 A+/A- 按钮

⚠️ **Sidecar 不要用全屏**——副屏 HTML 设计为可点击的控制台 · 全屏会失去顶部计时 / 锁定按钮

⚠️ iPad 触摸滚动 iframe 跟 macOS 鼠标滚轮表现略有不同 · 但锁定模式下你不滚也没事

---

## 弹窗被阻止

`window.open()` 在 iOS Safari / 严格隐私模式可能被阻止。

**症状**：点"🖥 演讲者"按钮无反应 / 弹一条"被阻止"提示。

**解法**：
- 浏览器地址栏 → 站点设置 → 允许弹窗
- 或：把"演讲者模式.html"用文件管理器双击打开 · 它会自动从 localStorage 读到最近一次广播状态

---

## 一次性弹窗 vs 多次

设计上：副屏窗口同一时间最多一个。多次点"🖥 演讲者"按钮：
- 第 1 次：开新窗口
- 后续：聚焦已有窗口 + 重发当前状态（fixes 副屏未跟上的情况）

这个语义和"按 F 进全屏 · 再按 F 退全屏"对偶。

---

## 多桌面 / 多 Mission Control 空间

副屏窗口可能跑到了另一个 Mission Control 桌面：
- macOS：Mission Control 把它拖回主桌面
- 或：把它移到 iPad 屏幕（副屏永远在 iPad 上 · 主屏永远在 Mac 上）

---

## 性能：145 张 slide · 频繁翻页 · 副屏不卡？

实测：
- BroadcastChannel postMessage 延迟 < 5ms
- localStorage 写 + 副屏 storage event 触发 < 50ms
- iframe scrollIntoView smooth 动画 ~600ms（视觉感受流畅）

翻页 → 副屏完成同步 总耗时 < 100ms · 讲师感觉不到延迟。

---

## 调试技巧

副屏不同步怎么排查：
1. 副屏 header 状态行——是否显示"已连接"
2. 主屏开 DevTools Console · 看 `broadcastPresenter` 是否有 error
3. 副屏开 DevTools · 看 BroadcastChannel onmessage / storage event 触发
4. 主屏在 Console 跑 `presenterChannel.postMessage({...})` 手动测
5. iframe 不滚锚点：副屏 Console 跑 `iframe.contentWindow.postMessage({type:'fuquan-scroll',anchor:'s0-1'}, '*')` 手动测
