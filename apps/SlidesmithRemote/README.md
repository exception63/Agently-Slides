# Slidesmith Remote · Apple Watch + iPhone 遥控

用 Apple Watch 遥控电脑上正在放映的 Slidesmith slides 翻页。

```
Apple Watch ──WebSocket──▶ 云中转(Cloudflare) ──▶ 电脑上的 deck ──▶ 翻页
      ▲ 只在配对时用一次
   iPhone（扫二维码拿 room，同步给手表）
```

手表发出的就是 deck 端已有的 `{"type":"cmd","action":"next"}` 协议，所以**中转和 deck 一行都没改**。

## 手势设计

| 操作 | 动作 |
|---|---|
| 点屏幕**下方大区** | 下一页 |
| 点屏幕**上方小区** | 上一页 |
| **捏合双击**（手垂身侧，不用抬手看表） | 下一页 |

> 为什么不做「屏幕单击=下一页 / 双击=上一页」：双击判定会让每次单击都等约 0.3 秒，
> 而「下一页」是最高频动作，不该被拖慢。分区方案零延迟，且靶区大、可盲按。
>
> 为什么捏合手势只绑了「下一页」：watchOS 27 SDK 里 `HandGestureShortcut` **只有 `primaryAction` 一个槽位**
> （已查证 SwiftUI.swiftinterface），单击捏合被系统占用（Smart Stack 选 widget），第三方拿不到第二个手势。

每次翻页有触觉反馈；**发不出去（没连上/放映端不在线）会给"错误"震动**，避免"按了以为翻了"。

## 首次装到真机

1. 用 Xcode 打开 `SlidesmithRemote.xcodeproj`（工程由 `project.yml` + xcodegen 生成，
   改了文件结构后跑 `xcodegen generate` 重新生成）。
2. 两个 target（`SlidesmithRemote` / `SlidesmithRemoteWatch`）→ Signing & Capabilities →
   Team 选自己的开发者账号。Bundle ID 冲突的话改 `project.yml` 里的 `com.zlyscu.*` 再重新生成。
3. iPhone 连上电脑，scheme 选 `SlidesmithRemote`，Run。
4. iPhone 上首次运行需信任证书：设置 → 通用 → VPN与设备管理 → 信任开发者。
5. 手表 App 会随手机 App 一起装到配对的 Apple Watch（可能要等几分钟；
   也可在 iPhone 的「Watch」App 里手动打开安装开关）。

## 用法

**一次性配对**
1. 电脑上打开 Studio 勾了「嵌入手机遥控」导出的 HTML。
2. 点左下角「📱 手机遥控」→ 选「云端连接」→ 出二维码。
3. iPhone 上打开 Slidesmith 遥控 → 扫码 → 自动同步给手表。

> 因为 Studio 把 room 固定烘进了 HTML，**一份 deck 只需扫这一次**，以后永久有效。

**演讲时**
1. 电脑打开这份 HTML → 全屏放映。
2. 抬腕打开手表上的 Slidesmith → 显示绿色「已连接放映端」。
3. 点分区或捏合双击翻页。手机不在身边也行——手表配对后直接连中转。

## 现场建议

- **别让 App 被系统收走**：Apple Watch → 设置 → 通用 → 返回时钟 → 选「1 小时后」
  （或给本 App 单独设「始终」）。本项目**没有**使用 `WKExtendedRuntimeSession`，
  因为它的类别只有健身/正念/闹钟等，没有适合"演示遥控"的，硬套属于滥用 API。
- 没网的会场：电脑上双击 `~/Desktop/启动本地遥控.command` 起本机 relay，
  手表连同一 WiFi；配对二维码里的地址会变成电脑的局域网 IP。

## 结构

```
Shared/RelayClient.swift    与中转的 WebSocket 客户端（手表/手机共用）
Shared/PairingStore.swift   二维码解析 + 配对信息持久化
Watch/                      手表 App（分区 UI + 捏合手势 + 触觉）
iOS/                        手机 App（扫码配对 + 同步给手表 + 备用遥控）
```

## 验证记录（2026-08-07）

在 Apple Watch Ultra 3 (49mm) · watchOS 27 模拟器实测，经真实 Cloudflare 云中转
控制浏览器里的 22 页 deck：下一页 1→2→3、上一页 3→2，分区与连接状态均正确。
真机（Ultra 3 + iOS 27）待用户装机确认，捏合手势需真机验证（模拟器无此手势）。
