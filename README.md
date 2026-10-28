# Mingyuan ERP — Frontend / 銘遠 ERP — フロントエンド / 铭远 ERP — 前端

**Languages / 言語 / 语言：** [English](#english) · [日本語](#日本語) · [中文](#中文)

---

<a id="english"></a>

## English

React single-page application for the [Mingyuan Digital ERP System](../README.md). It covers the manufacturing delivery workflow—orders, heat treatment, production archiving, QC, packing, shipping, and finance—and talks to the FastAPI backend via REST.

| Item | Description |
|------|-------------|
| Framework | React 18 + TypeScript |
| Build tool | Vite 5 |
| UI | Ant Design 5 |
| Routing | react-router-dom 6 (`BrowserRouter` on web, `HashRouter` in Electron) |
| i18n | react-i18next — `zh-CN`, `en-US`, `ja-JP` |
| Dev server | `http://localhost:5173` |
| API proxy (dev) | `/api` → `http://127.0.0.1:8000` (see `vite.config.ts`) |

### Pages & Routes

| Route | Page | Purpose |
|-------|------|---------|
| `/login` | `Login` | Demo login (token stored in `localStorage`) |
| `/` | `Dashboard` | Workspace overview |
| `/contracts` | `ContractOrdersPage` | Contract import, order entry, query, split |
| `/qc/heat-treatment` | `HeatTreatmentPage` | Trial records, chemical composition, summary |
| `/production` | `ProductionPage` | Product archiving & material master data |
| `/finance` | `FinancePage` | Test fee management |
| `/qc` | `QcWorkbenchPage` | QC workbench (multi-region panels, batch export) |
| `/packing` | `PackingPage` | Packing operations & packing list export |
| `/shipping-marks` | `ShippingMarksPage` | Shipping marks & delivery workflow |

Protected routes require `localStorage.erp_token`. Unauthenticated users are redirected to `/login`.

### Directory Layout

```
frontend/
├── src/
│   ├── pages/               # Route-level pages
│   ├── components/          # Feature panels (QC, shipping, test fees, etc.)
│   ├── layout/              # MainLayout — responsive nav & drawer
│   ├── locales/             # zh-CN.json, en-US.json, ja-JP.json
│   ├── utils/               # API client, file save, table helpers
│   ├── App.tsx              # Route definitions
│   ├── main.tsx             # Entry, Ant Design locale sync
│   └── i18n.ts              # i18next setup
├── index.html
├── vite.config.ts
├── package.json
├── Dockerfile               # Multi-stage build → nginx
└── nginx.conf               # Static hosting & API reverse proxy (Docker)
```

Backend API details: [`../backend/README.md`](../backend/README.md)

### Quick Start

**1. Install dependencies**

```bash
cd frontend
npm install
```

**2. Start the backend**

The dev server proxies `/api` to the backend. Start the API first (see [backend README](../backend/README.md)), or from the monorepo root:

```bash
npm run dev:backend
```

**3. Run the frontend**

```bash
# From this directory
npm run dev

# Or from monorepo root
npm run dev:frontend

# Full stack (frontend + backend)
npm run dev
```

Open `http://localhost:5173`.

**4. Production build**

```bash
npm run build
npm run preview   # Local preview of dist/
```

Set the backend URL at build time when not using the dev proxy:

```bash
# .env.production.local (do not commit real deployment URLs)
VITE_API_BASE_URL=http://localhost:8000
```

If `VITE_API_BASE_URL` is empty, requests use relative paths (suitable when nginx or Vite proxy forwards `/api`).

> Do not commit `.env*` files that contain internal hostnames, credentials, or customer-specific deployment details.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend base URL (no trailing slash). Optional in dev when using Vite proxy; set for production/Electron builds |

Example (local only):

```env
VITE_API_BASE_URL=http://localhost:8000
```

### Docker

From the monorepo root:

```bash
docker-compose up -d
```

Build the frontend image only:

```bash
docker build -t mingyuan-erp-frontend .
```

The image serves static files via nginx. Configure `nginx.conf` and build-time `VITE_API_BASE_URL` to match your deployment.

### Desktop & Mobile

| Target | Notes |
|--------|-------|
| Electron desktop | Built from monorepo root: `npm run desktop:package` (Win10/11) or `npm run desktop:package:win7` (Win7 x64/ia32). Uses `HashRouter` when loaded via `file://` |
| Capacitor (Android) | Dependencies are included; mobile packaging is configured at the monorepo level |

### Key Utilities

| Module | Role |
|--------|------|
| `utils/api.ts` | Fetch wrapper, timeout, reconnect, `Accept-Language` headers |
| `utils/clientFileSave.ts` | Save generated documents on desktop client |
| `utils/certificateBatchExport.ts` | Batch QC certificate export |
| `components/LanguageSwitcher.tsx` | UI language toggle (persists to `localStorage.erp_lang`) |

### Related Docs

- Project overview: [../README.md](../README.md)
- Backend API: [../backend/README.md](../backend/README.md)
- Phase-1 design: `docs/ph1/`

### License

Same as the [Mingyuan ERP monorepo](../README.md). Internal project — do not redistribute without an explicit license.

[↑ Back to top](#mingyuan-erp--frontend--銘遠-erp--フロントエンド--铭远-erp--前端)

---

<a id="日本語"></a>

## 日本語

[銘遠デジタル管理システム（ERP）](../README.md) の React シングルページアプリケーションです。受注・熱処理・製品登録・QC・梱包・出荷・財務など製造デリバリーフローをカバーし、FastAPI バックエンドと REST で連携します。

| 項目 | 説明 |
|------|------|
| フレームワーク | React 18 + TypeScript |
| ビルド | Vite 5 |
| UI | Ant Design 5 |
| ルーティング | react-router-dom 6（Web は `BrowserRouter`、Electron は `HashRouter`） |
| 多言語 | react-i18next — `zh-CN` / `en-US` / `ja-JP` |
| 開発サーバー | `http://localhost:5173` |
| API プロキシ（開発） | `/api` → `http://127.0.0.1:8000`（`vite.config.ts`） |

### ページとルート

| ルート | ページ | 用途 |
|--------|--------|------|
| `/login` | `Login` | デモログイン（`localStorage` にトークン保存） |
| `/` | `Dashboard` | ワークスペース概要 |
| `/contracts` | `ContractOrdersPage` | 契約取込、受注入力、検索、分割 |
| `/qc/heat-treatment` | `HeatTreatmentPage` | 試験記録、化学成分、集計 |
| `/production` | `ProductionPage` | 製品登録・資材マスタ |
| `/finance` | `FinancePage` | 試験費用管理 |
| `/qc` | `QcWorkbenchPage` | QC ワークベンチ（地域別パネル、一括エクスポート） |
| `/packing` | `PackingPage` | 梱包操作・梱包リスト出力 |
| `/shipping-marks` | `ShippingMarksPage` | 出荷マーク・出荷フロー |

保護ルートは `localStorage.erp_token` が必要です。未ログイン時は `/login` へリダイレクトされます。

### ディレクトリ構成

```
frontend/
├── src/
│   ├── pages/               # ルートページ
│   ├── components/          # 機能パネル（QC、出荷、試験費用等）
│   ├── layout/              # MainLayout — レスポンシブナビ
│   ├── locales/             # zh-CN.json, en-US.json, ja-JP.json
│   ├── utils/               # API クライアント、ファイル保存、テーブル補助
│   ├── App.tsx              # ルート定義
│   ├── main.tsx             # エントリ、Ant Design ロケール同期
│   └── i18n.ts              # i18next 設定
├── index.html
├── vite.config.ts
├── package.json
├── Dockerfile               # マルチステージ → nginx
└── nginx.conf               # 静的配信・API リバースプロキシ（Docker）
```

バックエンド API 詳細：[../backend/README.md](../backend/README.md)

### クイックスタート

**1. 依存関係のインストール**

```bash
cd frontend
npm install
```

**2. バックエンドの起動**

開発サーバーは `/api` をバックエンドへプロキシします。先に API を起動してください（[backend README](../backend/README.md) 参照）、または monorepo ルートから：

```bash
npm run dev:backend
```

**3. フロントエンド起動**

```bash
# 本ディレクトリから
npm run dev

# monorepo ルートから
npm run dev:frontend

# フルスタック（フロント + バック）
npm run dev
```

ブラウザで `http://localhost:5173` を開きます。

**4. 本番ビルド**

```bash
npm run build
npm run preview   # dist/ のローカルプレビュー
```

開発プロキシを使わない場合はビルド時にバックエンド URL を設定：

```bash
# .env.production.local（本番 URL をコミットしないこと）
VITE_API_BASE_URL=http://localhost:8000
```

`VITE_API_BASE_URL` が空の場合、相対パスでリクエストします（nginx や Vite プロキシが `/api` を転送する構成向け）。

> 内部ホスト名、認証情報、顧客固有のデプロイ情報を含む `.env*` ファイルはコミットしないでください。

### 環境変数

| 変数 | 説明 |
|------|------|
| `VITE_API_BASE_URL` | バックエンドベース URL（末尾スラッシュなし）。Vite プロキシ利用時は開発で省略可；本番/Electron ビルドでは設定推奨 |

例（ローカルのみ）：

```env
VITE_API_BASE_URL=http://localhost:8000
```

### Docker

monorepo ルートから：

```bash
docker-compose up -d
```

フロントエンドイメージのみ：

```bash
docker build -t mingyuan-erp-frontend .
```

イメージは nginx で静的ファイルを配信します。`nginx.conf` とビルド時の `VITE_API_BASE_URL` を環境に合わせて設定してください。

### デスクトップ・モバイル

| ターゲット | 備考 |
|------------|------|
| Electron デスクトップ | monorepo ルート：`npm run desktop:package`（Win10/11）または `npm run desktop:package:win7`（Win7 32/64 ビット）。`file://` 読み込み時は `HashRouter` |
| Capacitor（Android） | 依存関係同梱；モバイル打包は monorepo 側で設定 |

### 主要ユーティリティ

| モジュール | 役割 |
|------------|------|
| `utils/api.ts` | Fetch ラッパー、タイムアウト、再接続、`Accept-Language` |
| `utils/clientFileSave.ts` | デスクトップクライアントでの帳票保存 |
| `utils/certificateBatchExport.ts` | QC 保証書一括エクスポート |
| `components/LanguageSwitcher.tsx` | UI 言語切替（`localStorage.erp_lang` に保存） |

### 関連ドキュメント

- プロジェクト概要：[../README.md](../README.md)
- バックエンド API：[../backend/README.md](../backend/README.md)
- 第 1 期設計：`docs/ph1/`

### ライセンス

[銘遠 ERP monorepo](../README.md) と同一。社内プロジェクトのため、明示的なライセンス声明がない限り外部配布しないでください。

[↑ Back to top](#mingyuan-erp--frontend--銘遠-erp--フロントエンド--铭远-erp--前端)

---

<a id="中文"></a>

## 中文

[铭远数字化管理系统](../README.md) 的 React 单页应用，覆盖订单、热处理、产品建档、质检、装箱、发货、财务等制造交付流程，通过 REST 与 FastAPI 后端通信。

| 项目 | 说明 |
|------|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5 |
| UI | Ant Design 5 |
| 路由 | react-router-dom 6（Web 用 `BrowserRouter`，Electron 用 `HashRouter`） |
| 国际化 | react-i18next — `zh-CN` / `en-US` / `ja-JP` |
| 开发地址 | `http://localhost:5173` |
| 开发代理 | `/api` → `http://127.0.0.1:8000`（见 `vite.config.ts`） |

### 页面与路由

| 路由 | 页面 | 说明 |
|------|------|------|
| `/login` | `Login` | Demo 登录（token 存于 `localStorage`） |
| `/` | `Dashboard` | 工作台概览 |
| `/contracts` | `ContractOrdersPage` | 合同导入、订单录入、查询、分割 |
| `/qc/heat-treatment` | `HeatTreatmentPage` | 试验记录、化学成分、结果汇总 |
| `/production` | `ProductionPage` | 产品建档与物料主数据 |
| `/finance` | `FinancePage` | 试验费用管理 |
| `/qc` | `QcWorkbenchPage` | 质检工作台（多区域面板、批量导出） |
| `/packing` | `PackingPage` | 装箱操作与装箱单导出 |
| `/shipping-marks` | `ShippingMarksPage` | 唛头与发货流程 |

受保护路由需 `localStorage.erp_token`；未登录将重定向至 `/login`。

### 目录结构

```
frontend/
├── src/
│   ├── pages/               # 路由页面
│   ├── components/          # 功能面板（质检、发货、试验费用等）
│   ├── layout/              # MainLayout — 响应式导航与 Drawer
│   ├── locales/             # zh-CN.json、en-US.json、ja-JP.json
│   ├── utils/               # API 封装、文件保存、表格辅助
│   ├── App.tsx              # 路由定义
│   ├── main.tsx             # 入口、Ant Design 语言同步
│   └── i18n.ts              # i18next 配置
├── index.html
├── vite.config.ts
├── package.json
├── Dockerfile               # 多阶段构建 → nginx
└── nginx.conf               # 静态资源与 API 反代（Docker）
```

后端 API 说明见 [`../backend/README.md`](../backend/README.md)。

### 快速开始

**1. 安装依赖**

```bash
cd frontend
npm install
```

**2. 启动后端**

开发服务器会将 `/api` 代理到后端，请先启动 API（见 [backend README](../backend/README.md)），或在 monorepo 根目录执行：

```bash
npm run dev:backend
```

**3. 启动前端**

```bash
# 在本目录
npm run dev

# 在 monorepo 根目录
npm run dev:frontend

# 前后端一起启动
npm run dev
```

浏览器访问 `http://localhost:5173`。

**4. 生产构建**

```bash
npm run build
npm run preview   # 本地预览 dist/
```

不使用开发代理时，需在构建时指定后端地址：

```bash
# .env.production.local（请勿提交真实部署地址）
VITE_API_BASE_URL=http://localhost:8000
```

若 `VITE_API_BASE_URL` 为空，则使用相对路径请求（适用于 nginx 或 Vite 代理转发 `/api` 的场景）。

> 请勿提交包含内网地址、账号密码或客户部署细节的 `.env*` 文件。

### 环境变量

| 变量 | 说明 |
|------|------|
| `VITE_API_BASE_URL` | 后端根 URL（无末尾斜杠）。开发使用 Vite 代理时可省略；生产/Electron 构建建议配置 |

示例（仅本地）：

```env
VITE_API_BASE_URL=http://localhost:8000
```

### Docker

在 monorepo 根目录：

```bash
docker-compose up -d
```

仅构建前端镜像：

```bash
docker build -t mingyuan-erp-frontend .
```

镜像通过 nginx 提供静态资源；请按部署环境配置 `nginx.conf` 与构建时的 `VITE_API_BASE_URL`。

### 桌面与移动端

| 目标 | 说明 |
|------|------|
| Electron 桌面 | 在 monorepo 根目录：`npm run desktop:package`（Win10/11）或 `npm run desktop:package:win7`（Win7 32/64 位）；`file://` 协议下使用 `HashRouter` |
| Capacitor（Android） | 依赖已配置；移动端打包在 monorepo 层完成 |

### 主要工具模块

| 模块 | 作用 |
|------|------|
| `utils/api.ts` | 请求封装、超时、重连、`Accept-Language` |
| `utils/clientFileSave.ts` | 桌面客户端保存生成文件 |
| `utils/certificateBatchExport.ts` | 质保书批量导出 |
| `components/LanguageSwitcher.tsx` | 界面语言切换（写入 `localStorage.erp_lang`） |

### 相关文档

- 项目总览：[../README.md](../README.md)
- 后端 API：[../backend/README.md](../backend/README.md)
- 一期设计：`docs/ph1/`

### 许可证

与 [铭远数字化 ERP monorepo](../README.md) 保持一致；内部项目，未单独声明开源协议前请勿对外分发。

[↑ Back to top](#mingyuan-erp--frontend--銘遠-erp--フロントエンド--铭远-erp--前端)
