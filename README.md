# GCS File Access API

Google Cloud Storage (GCS) バケット `agridx` の `統合生命科学特論/` 配下ファイルを操作する Flask API です。  
Cloud Run デプロイと、Vercel での公開HP/管理画面配信を想定しています。

## 公開URL
- 公開HP: `https://ui-b26q9lbq9-kouta-honjos-projects.vercel.app/`
- 管理画面: `https://ui-b26q9lbq9-kouta-honjos-projects.vercel.app/admin/`

## 実装内容
- ファイル一覧取得
- ファイルアップロード
- ファイルダウンロード
- ファイル削除
- CORS 対応（Vercel UI から呼び出し可能）
- ニュース/行事予定の管理（GCS JSON）
- Google OAuth による管理者認証

## 構成
- `main.py`: Flask API 本体
- `requirements.txt`: Python 依存
- `Dockerfile`: Cloud Run 用コンテナ
- `admin/`: 管理画面（Vercel 静的配信）
- `public/`: 公開HP（Vercel 静的配信）
- `api/`: Vercel Serverless Function（`/api/proxy`）
  - `admin/config.js`: `GOOGLE_OAUTH_CLIENT_ID` 設定
  - `public/config.js`: `PUBLIC_API_BASE` 設定

## 必要な環境変数
- `GCS_BUCKET_NAME` (default: `agridx`)
- `GCS_FOLDER_PREFIX` (default: `統合生命科学特論/`)
- `CMS_PREFIX` (default: `cms/`)
- `GOOGLE_CLOUD_PROJECT` (ローカル実行時に必要)
- `ALLOWED_ORIGINS` (推奨: `https://ui-b26q9lbq9-kouta-honjos-projects.vercel.app`)
- `GOOGLE_OAUTH_CLIENT_ID`
- `ADMIN_ALLOW_EMAILS` (例: `admin1@example.com,admin2@example.com`)

## API エンドポイント
- `GET /` : ヘルスチェック
- `GET /files` : ファイル一覧
- `POST /upload` : ファイルアップロード (`multipart/form-data`, field: `file`)
- `GET /download/<filename>` : ファイルダウンロード
- `DELETE /delete/<filename>` : ファイル削除
- `GET /content/news` : ニュース一覧取得
- `POST /content/news` : ニュース作成
- `PUT /content/news/<id>` : ニュース更新
- `DELETE /content/news/<id>` : ニュース削除
- `GET /content/events` : 行事予定一覧取得
- `POST /content/events` : 行事予定作成
- `PUT /content/events/<id>` : 行事予定更新
- `DELETE /content/events/<id>` : 行事予定削除
- `GET /public/news` : 公開ニュース一覧取得
- `GET /public/events` : 公開行事予定一覧取得

## ローカル起動
```powershell
cd C:\Users\81906\Desktop\ファイルアクセス
python -m pip install -r requirements.txt
$env:GOOGLE_CLOUD_PROJECT="ihomework1"
python main.py
```

起動後:
- API: `http://localhost:8080`
- ヘルスチェック: `GET http://localhost:8080/`

## Cloud Run デプロイ例
```powershell
gcloud auth login --update-adc
gcloud config set project ihomework1

gcloud builds submit --tag gcr.io/ihomework1/gcs-file-api:v1

gcloud run deploy gcs-backend-service `
  --image gcr.io/ihomework1/gcs-file-api:v1 `
  --platform managed `
  --region asia-northeast2 `
  --allow-unauthenticated `
  --service-account gcs-backend-service-sa@ihomework1.iam.gserviceaccount.com `
  --set-env-vars GCS_BUCKET_NAME=agridx,GCS_FOLDER_PREFIX="統合生命科学特論/",CMS_PREFIX="cms/",ALLOWED_ORIGINS="https://ui-b26q9lbq9-kouta-honjos-projects.vercel.app",GOOGLE_OAUTH_CLIENT_ID="<YOUR_CLIENT_ID>",ADMIN_ALLOW_EMAILS="admin1@example.com"
```

## Vercel での確認
1. 管理画面を開く: `https://ui-b26q9lbq9-kouta-honjos-projects.vercel.app/admin/`
2. `Backend URL` に Cloud Run のURLを入力
3. Google Sign-In でログイン
4. ニュース/行事予定の作成・更新・削除を実行

## 静的設定ファイル
- `admin/config.js`: `window.GOOGLE_OAUTH_CLIENT_ID` に OAuth Client ID を設定
- `public/config.js`: `window.PUBLIC_API_BASE` に Cloud Run のURLを設定

## IAM
Cloud Run のサービスアカウントに最低限以下を付与:
- `Storage Object Admin`（検証用）
