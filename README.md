# 本地视频库

一个纯前端、零后端、零依赖的本地 MP4 视频管理网站。

视频文件保存在浏览器 **IndexedDB** 中，分类配置保存在 **LocalStorage** 中，无需账号或服务器。

## 功能

- **本地视频存储**：MP4 视频以 `Blob` 形式保存到 IndexedDB，不上传服务器。
- **MP4 专用**：上传仅支持 `.mp4` 视频文件。
- **分类管理**：添加、切换、重命名、删除分类；删除分类时其中的视频自动转移到「未分类」。
- **即点即播**：点击视频卡片打开原生 HTML5 MP4 播放器。
- **原文件保存**：上传过程中不会转码、压缩或修改 MP4 文件。
- **备份与恢复**：导出包含分类和视频内容的 JSON；恢复时将 Base64 视频重新转换为 Blob 后存入 IndexedDB。
- **存储监控**：优先使用浏览器 `StorageManager.estimate()` 获取当前存储配额，并显示估算占用比例。
- **拖拽上传**：支持点击选择和拖拽 MP4 文件。
- **移动端侧边栏**：手机端通过汉堡按钮打开分类侧边栏，点击遮罩或切换分类即可关闭。
- **响应式暗色主题**：桌面、平板和手机均有适配。

## 实际存储架构

```text
浏览器
├── LocalStorage
│   └── 分类配置
│       └── videoLib_cats_v1
│
└── IndexedDB
    └── VideoLibraryDB / library
        └── videoLib_v1
            └── videos[]
                ├── Blob MP4 视频文件
                ├── name
                ├── category
                ├── size
                ├── type
                ├── createdAt
                └── thumbnail