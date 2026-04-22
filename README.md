# SHANLIC LIFE TRACKER SYSTEM

一个基于 `Vue 3 + Vite + TypeScript` 的模块化个人工具站。

当前项目提供一个带入口场景的主壳应用，首页展示多个功能模块；进入模块后，通过 `iframe` 加载 `public/modules` 下的独立页面。现有模块包括：

- 笔记系统
- 抽奖转盘
- 航班查询
- 单词系统
- 四象限图
- 爱好追踪表

## 项目特点

- 使用 Vue 构建主入口与模块切换逻辑
- 通过哈希路由切换模块，无需额外路由库
- 每个工具模块可独立维护，主壳负责统一入口体验
- 单词系统支持英语/俄语双词库、分组管理、导入导出与测试练习

## 技术栈

- `Vue 3`
- `Vite`
- `TypeScript`
- 静态模块页面：`HTML + CSS + JavaScript`

## 环境要求

- `Node.js`：`^20.19.0 || >=22.12.0`
- `npm`

## 本地开发

```powershell
cd "W:\单词\SHANLIC LIFE TRACKER SYSTEM"
npm install
npm run dev
```

启动后按 Vite 输出的本地地址访问即可。

## 常用命令

```powershell
npm run dev
npm run build
npm run build-only
npm run check:modules
npm run verify
npm run preview
npm run type-check
npm run desktop:dev
npm run desktop:build
```

命令说明：

- `npm run dev`：启动开发服务器
- `npm run build`：先做类型检查，再打包
- `npm run build-only`：直接执行 Vite 打包
- `npm run check:modules`：检查模块注册、桌面存储映射与 `public/modules` 目录是否一致
- `npm run verify`：执行一致性检查并完成构建
- `npm run preview`：预览打包结果
- `npm run type-check`：执行 `vue-tsc`
- `npm run desktop:dev`：同时启动 Vite 与 Electron 桌面开发模式
- `npm run desktop:build`：构建桌面安装包

## 部署到 GitHub Pages

这个项目现在已经调整为适合 `GitHub Pages` 的静态部署方式，不需要后端。

### 你需要做的事

1. 把项目上传到 GitHub 仓库
2. 默认分支使用 `main`
3. 打开仓库的 `Settings -> Pages`
4. 在 `Build and deployment` 中把 `Source` 设为 `GitHub Actions`
5. 把代码推送到 `main` 分支

之后 GitHub 会自动执行工作流：

- 检查模块配置一致性
- 安装依赖
- 运行 `npm run verify`
- 发布 `dist/` 到 GitHub Pages

### 工作流文件

自动部署配置文件在：

- [.github/workflows/deploy-pages.yml](./.github/workflows/deploy-pages.yml)

### 发布后的访问地址

发布成功后，页面通常会出现在：

```text
https://你的用户名.github.io/你的仓库名/
```

### 注意事项

- 这是静态站点部署，不需要数据库和后端服务
- 当前数据主要保存在浏览器本地 `localStorage`
- 因为没有后端，电脑和手机之间不会自动同步数据
- 如果要跨设备迁移数据，建议使用项目内的 JSON 导出和导入功能

## 页面与路由

项目主入口在 Vue 应用中，模块通过哈希路由切换：

- 首页：`#/`
- 模块页：`#/module/<moduleKey>`

例如：

- `#/module/words`
- `#/module/notes`

模块定义集中在 [src/lib/modules.ts](./src/lib/modules.ts)，每个模块包含：

- `key`：模块唯一标识
- `title`：模块标题
- `subtitle`：模块副标题
- `publicEntry`：模块实际加载地址
- `orbit`：首页场景中的视觉布局参数

## 项目结构

```text
SHANLIC LIFE TRACKER SYSTEM
├─ src
│  ├─ App.vue                      # 主应用，负责路由解析与模块切换
│  ├─ main.ts                      # Vue 挂载入口
│  ├─ lib/modules.ts               # 模块注册表
│  ├─ components/PortalScene.vue   # 首页入口场景
│  └─ components/ModuleWorkspace.vue
│                                 # 模块容器，通过 iframe 加载 public 模块
├─ public
│  └─ modules
│     ├─ notes                     # 笔记系统
│     ├─ lottery                   # 抽奖转盘
│     ├─ flight                    # 航班查询
│     ├─ words                     # 单词系统
│     ├─ quadrant                  # 四象限图
│     └─ shared                    # 模块共享样式资源
├─ dist                            # 打包产物
├─ scripts
│  └─ check-module-consistency.mjs # 模块与桌面配置一致性检查
└─ package.json
```

## 单词系统说明

单词系统位于 [public/modules/words/index.html](./public/modules/words/index.html) 和 [public/modules/words/app.js](./public/modules/words/app.js)。

### 当前能力

- 英语、俄语双词库
- 分组创建、删除、切换
- 手动录入单词
- 英语/俄语测试模式
- 测试前选择一个或多个分组
- 本地持久化保存
- JSON 导入、导出

### 使用规则

- 空分组不会参与测试
- 开始测试前，所选分组至少要有 `2` 组单词，且至少有 `2` 个不同释义
- 测试中会暂时禁用词库编辑操作
- 数据默认保存在浏览器 `localStorage`

### 本地存储

单词系统当前使用的本地存储键名为：

```text
word-practice-data-v2
```

## 单词 JSON 格式

单词系统当前导出格式如下：

```json
{
  "english": {
    "groups": [
      {
        "id": "group_xxx",
        "name": "常用",
        "entries": [
          {
            "id": "entry_xxx",
            "word": "apple",
            "meaning": "苹果"
          }
        ]
      }
    ]
  },
  "russian": {
    "groups": [
      {
        "id": "group_xxx",
        "name": "俄语日常",
        "entries": [
          {
            "id": "entry_xxx",
            "word": "привет",
            "meaning": "你好"
          }
        ]
      }
    ]
  }
}
```

### 兼容的导入格式

除了上面的分组格式，代码里还兼容以下几类数据：

1. 直接传入词条数组

```json
[
  { "word": "apple", "meaning": "苹果" },
  { "word": "banana", "meaning": "香蕉" }
]
```

2. 按语言拆分的 `groups` 格式

```json
{
  "english": {
    "groups": [
      {
        "name": "基础词",
        "entries": [
          { "word": "apple", "meaning": "苹果" }
        ]
      }
    ]
  },
  "russian": {
    "groups": [
      {
        "name": "日常",
        "entries": [
          { "word": "привет", "meaning": "你好" }
        ]
      }
    ]
  }
}
```

3. 旧版数组格式

```json
{
  "englishWords": ["apple", "banana"],
  "chineseMeanings": ["苹果", "香蕉"]
}
```

4. 按语言拆分的 `words + meanings` 格式

```json
{
  "english": {
    "words": ["apple", "banana"],
    "meanings": ["苹果", "香蕉"]
  },
  "russian": {
    "words": ["привет"],
    "meanings": ["你好"]
  }
}
```

## 开发约定

- 主壳逻辑优先维护在 `src/`
- 独立工具页面优先维护在 `public/modules/<module>/`
- `dist/` 为构建产物，不建议手动修改
- 如果新增模块，需要同时完成两步：

1. 在 `public/modules/` 下创建对应模块目录与入口页面
2. 在 [src/lib/modules.ts](./src/lib/modules.ts) 中注册新模块

## 维护建议

## 桌面版更新与 Releases

项目现在已经接入了 Electron 自动更新，并把 GitHub Releases 配成了默认更新源。

- 仓库：`Dsh0205/SLTS`
- 自动更新来源：`GitHub Releases`
- 桌面发布命令：`npm run desktop:release`

### 最省事的发布方式

以后发新版本时，按这个流程就可以：

1. 把 [`package.json`](./package.json) 里的 `version` 改成新版本，例如 `1.1.3`
2. 提交代码并推到 `main`
3. 创建对应标签，比如 `v1.1.3`
4. 把这个标签推到 GitHub

```powershell
git add .
git commit -m "release: v1.1.3"
git push origin main
git tag v1.1.3
git push origin v1.1.3
```

仓库里的 [`release-desktop.yml`](./.github/workflows/release-desktop.yml) 会自动：

- 安装依赖
- 打包 Windows 桌面版
- 创建或更新 GitHub Release
- 上传自动更新所需文件

### 如果你手动发 Release

至少需要上传这些文件：

- 安装包 `.exe`
- `latest.yml`
- 对应的 `.blockmap`

只上传源码压缩包不够，桌面版自动更新不会读取源码包。

### 用户端更新方式

桌面版左上角设置里已经加入“检查更新”按钮：

- 无新版本时会提示已是最新版
- 有新版本时会自动开始下载
- 下载完成后按钮会变成“立即安装更新”
- 点击后应用会退出并安装新版本

- 编辑中文、俄语内容时，统一使用 `UTF-8`
- 如果某个模块只是静态页面，可继续沿用 `public/modules/...` 的组织方式
- 如果后续某个模块交互越来越复杂，可以考虑把该模块逐步迁移到 `src/` 内部，统一纳入 Vue 组件体系
- `public/modules` 下允许保留历史目录，但只有在 `src/lib/modules.ts` 中注册过的模块才会出现在主入口
- 部分未注册目录可以作为辅助页面保留，例如 `comic` 当前由 `flight` 模块内链接进入，不再出现在主页模块球中

## 相关文件

- [src/App.vue](./src/App.vue)
- [src/lib/modules.ts](./src/lib/modules.ts)
- [src/components/PortalScene.vue](./src/components/PortalScene.vue)
- [src/components/ModuleWorkspace.vue](./src/components/ModuleWorkspace.vue)
- [public/modules/words/index.html](./public/modules/words/index.html)
- [public/modules/words/app.js](./public/modules/words/app.js)
