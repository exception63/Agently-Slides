# 跨窗口同步通信 · 3 种 API 对比

> 为什么本 skill 用 BroadcastChannel + localStorage 双通道 + postMessage 跨 iframe。

---

## 3 个 API 各干什么

| API | 用在哪 | 适合 | 限制 |
|---|---|---|---|
| **BroadcastChannel** | 同一 origin 的不同窗口 / tab / iframe 间 | 实时性强 · API 简洁 | Safari < 15.4 / 老 IE 不支持 · 跨 file:// origin 可能不通 |
| **localStorage 事件** | 同 origin 的不同窗口 | 兼容全 · 持久化 | 5-50ms 延迟 · 只在 OTHER 窗口写时触发 · 同窗口写自己不收 |
| **postMessage** | 任何窗口间（含跨 origin） | 跨域唯一选择 · 永远可用 | API 稍繁 · 需手动定义协议 |

---

## 本 skill 的通信拓扑

```
   主屏窗口（slides HTML）          副屏窗口（演讲者模式 HTML）
   ┌─────────────────────┐         ┌────────────────────────────┐
   │ broadcastPresenter()│         │ applyState()               │
   │                     │         │  ↓                         │
   │  ① BroadcastChannel │ ──────→ │  BroadcastChannel onmessage│
   │  ② localStorage     │ ──────→ │  storage event             │
   │                     │         │                            │
   │                     │         │  jumpToAnchor()            │
   │                     │         │   ↓                        │
   │                     │         │  iframe.postMessage(...) ──┼──→ 讲稿 iframe
   └─────────────────────┘         └────────────────────────────┘                ↓
                                                                     window.message 监听
                                                                     scrollIntoView
```

**3 段通信**：
- 主屏 → 副屏：**BroadcastChannel + localStorage 双通道**（健壮）
- 副屏 → 讲稿 iframe：**postMessage**（跨 file:// 必须）

---

## 为什么不只用 BroadcastChannel?

BC 是最现代的方案 · 但：

- Safari 15.4 (2022-03) 才支持 · iPad 老系统可能没有
- file:// 跨目录（如主屏 `02-slides/x.html` vs 副屏 `02-slides/y.html`）—— 现代浏览器一般同 origin 通 · 但若一边是 02-slides 一边是 01-讲稿就**不一定**
- 老 WebView（如某些会议室一体机）只支持到 ES2017 标准 · BC 没保证

→ 加 **localStorage event 兜底** · 0 成本 · 兼容 IE11 都通。

---

## 为什么 iframe 不能用 contentDocument 直接滚?

最直觉的方法：

```js
// ❌ 直接 DOM 访问 iframe 内部
iframe.contentDocument.getElementById('s0-1').scrollIntoView();
```

这在 file:// 跨目录场景**抛 SecurityError**——浏览器视为跨域。

第二个直觉：

```js
// ⚠️ 设置 hash · 浏览器自动滚
iframe.contentWindow.location.hash = '#s0-1';
```

这**有时**能工作（hash 写入跨域允许）· 但：
- 部分浏览器 / 部分 file:// 配置仍抛错
- 设同样 hash 无副作用（已是 #s0-1 时再设无效）

→ 最稳的是 **postMessage**：

```js
// ✅ 永远可用 · W3C 跨域通信标准
iframe.contentWindow.postMessage({ type: 'fuquan-scroll', anchor: 's0-1' }, '*');
```

讲稿 HTML 这边监听：

```js
window.addEventListener('message', e => {
  if (e.data?.type === 'fuquan-scroll') {
    document.getElementById(e.data.anchor)?.scrollIntoView({ behavior: 'smooth' });
  }
});
```

**优点**：
- 跨 origin 永远可用（这是该 API 设计目的）
- 同 anchor 重复触发也起效（自定义消息 · 总是被处理）
- 消息可携带自定义参数（未来想加 `block: 'center'` / 高亮 / 静默模式等）

**注意**：
- `targetOrigin` 参数填 `'*'` —— 对于 file:// · 你也填不出具体 origin · 接收端用 `e.data` 校验消息类型即可
- 接收端要校验 `e.data.type` —— 别处理来路不明的 message

---

## localStorage event 的细节坑

`window.addEventListener('storage', e => ...)` 只在 **其他窗口** 写时触发 · 同窗口 setItem 自己不收。

这正合我们的用例：主屏写 · 副屏收。但要注意：
- key 必须存在变化（同 value 重复写不触发）—— 所以 payload 里加 `ts: Date.now()` 保证每次都"变化"
- value 必须是字符串 —— JSON.stringify 包装

---

## 为什么 BroadcastChannel name 用 'fuquan-presenter-sync'?

随便起 · 但要：
- 全 app 内唯一（防其他 BC 误收）
- 含项目名前缀（`fuquan-` / `course-` / `presenter-` 前缀）方便调试时识别

如果做新课程：把 `fuquan` 换成项目代号即可。
