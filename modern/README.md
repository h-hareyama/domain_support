# 新構成（並行移行中）

このディレクトリは、公開中の静的フォームとは別に用意した移行先です。現時点では本番切替もデータ送信も行っていません。既存のスプレッドシートを原本、Notionを作業台とする流れは変えず、APIから従来のGASに送ります。

## 構成

- `web/`: Vue 3 + TypeScript + Vite。入力画面と下書き保存。
- `api/`: Fastify + Zod。入力検証、送信制限、GASへの転送。
- `nginx.conf`: 同一オリジンでフォームとAPIを配信。
- `compose.yaml`: Linux + Docker Compose向けの2サービス構成。

GASのURLと共有トークンはAPIコンテナの環境変数だけに設定します。旧フォームの公開JSにはトークンが残っているため、**本番切替時にはGAS側の共有トークンを更新し、旧フォームを停止または送信できない状態にする必要があります。** トークンだけでは利用者認証にならないため、社外公開前に社内の認証・アクセス制御方針も決めてください。

## ローカル確認

```bash
cd modern
npm ci
npm run check
npm test
npm run build:api
npm run build:web
npm run dev:web
```

Viteのプレビューは `http://localhost:5173/` です。APIがない状態では送信できません。GASへ誤送信しないよう、ローカル確認では本番の環境変数を設定しないでください。
ブラウザのスモークテストは開発サーバーを起動した状態で `npx playwright install chromium --only-shell`、`npm run test:browser` の順に実行します。テストは送信ボタンを押しません。

## Linux + Docker Composeでの検証

`modern/.env.example` を参考に、サーバー上の `modern/.env` に本番用の `GAS_ENDPOINT` と `GAS_SHARED_TOKEN` を設定します。`.env` はGitに含めません。権限を管理し、バックアップやログにも値を残さないようにしてください。

```bash
cd modern
docker compose config
docker compose build
docker compose up -d
```

Webはホストの `127.0.0.1:8080` のみに公開されます。競合する場合は `WEB_PORT` で変更できます。外部公開する場合は、社内サーバーの既存のHTTPSリバースプロキシからこのポートへ接続し、TLSとアクセス制御を設定してください。GASへの疎通、スプレッドシートへの1件のテスト転記、Notionへの転記確認を行ってから切り替えます。現在のGASはスプレッドシートへの追記後、Notion登録が失敗しても受付成功を返すため、受付番号はNotion転記の証明になりません。受付結果が不明な場合、重複登録を避けるため、再送前にスプレッドシートを確認します。

## 未移行の範囲

このリポジトリには管理画面とGAS本体がありません。管理画面の移植、GAS側のトークン更新、既存データとの統合確認、本番環境のHTTPS・認証設定は別途必要です。新フォームは旧フォームと並行して置いてあり、旧URLは変更していません。
