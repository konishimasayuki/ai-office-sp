# AIオフィス マカセル（ai-office-sp）

秘書AIに一言伝えるだけで、部署AI（12人）が分担して成果物（企画書・営業メール・チラシなど）を作り、外に出すものだけ人間が承認するAIオフィスです。koyo-ops の「AI社員」タブを、複数の会社が使える単独のシステムとして切り出したものです。

## 構成

React 18 + Vite 5（Biome）、Vercel API Routes、Upstash Redis、Claude API（Web検索ツール付き）。

## 公開の手順

1. Vercel で このリポジトリを読み込む（プロジェクト名 ai-office-sp）
2. Storage から Upstash（Redis）を作成して接続する（KV_REST_API_URL / KV_REST_API_TOKEN が自動で入る）
3. Settings → Environment Variables に ANTHROPIC_API_KEY を追加して Redeploy
4. 初回アクセスで TEST株式会社 と運営者アカウント z / z が自動で作られる。ログイン後すぐにパスワードを変更する

## 会社（テナント）

- 会社ごとのデータはRedisの `mk:t:{会社ID}:` の下に分かれる。AI社員のデータは `mk:t:{会社ID}:ai:`
- 運営者（z）は「運営管理」から会社の追加・費用の上限・利用停止ができる
- 各社の管理者は「会社プロフィール」に事業・商品・料金・連絡先などを入れる。AIはこれを会社の前提として読む

## 表記の変更

製品名・看板などは `src/brand.js` だけで管理する（index.html と manifest もビルド時にここから作る）。

## 主なファイル

| ファイル | 中身 |
| --- | --- |
| api/_agents.js | 12人の役割・モデル・料金表・成果物の形 |
| api/ai.js | AI社員のAPI（秘書チャット、案件化、自動進行、秘書チェック、承認、費用） |
| api/_lib.js | Redis接続、ログイン、会社・ユーザー・プロフィール、初回の自動作成 |
| api/profile.js | 会社プロフィール |
| api/tenants.js | 運営管理（会社の一覧・追加・上限・停止） |
| src/pages/AiStaff.jsx | オフィス・秘書チャット・案件ボード・承認箱・成果物 |
| src/ai/Office.jsx | オフィスのイラスト |
