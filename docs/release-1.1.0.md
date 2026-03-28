# SHANLIC LIFE TRACKER SYSTEM v1.1.0

发布日期：2026-03-28

## 本次改动

1. 笔记模块升级为双编辑模式：
- 保留原有完整编辑流程（主编辑区）。
- 新增页内右侧浮动小窗编辑（快速记录）。
- 将“桌面悬浮笔记窗”入口集中移动到笔记页内（顶部按钮 + 小窗按钮）。

2. 主页设置入口调整：
- 新增左上角齿轮设置按钮。
- 将原右上角的桌面项收口到设置面板中：
  - 开机自启动
  - 导出备份
  - 导入恢复
- 删除旧版右上角 `Desktop Vault` 固定面板。

3. 主页模块入口整合：
- 主页移除独立漫画小球，仅保留航班入口。
- 在航班页面中保留“漫画按钮”，点击直接跳转漫画页面，从而节省主页空间。

## 涉及文件

- `public/modules/notes/index.html`
- `public/modules/notes/app.js`
- `public/modules/notes/style.css`
- `src/components/PortalScene.vue`
- `src/lib/modules.ts`
- `public/modules/flight/index.html`
