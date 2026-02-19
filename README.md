# GCS File Access API

Google Cloud Storage (GCS) バケット `agridx` の `統合生命科学特論/` 配下ファイルを操作する Flask API です。  
Cloud Run デプロイと、Vercel UI からの操作確認を想定しています。

## 実装内容
- ファイル一覧取得
- ファイルアップロード
- ファイルダウンロード
- ファイル削除
- CORS 対応（Vercel UI から呼び出し可能）

## 構成
- `main.py`: Flask API 本体
- `requirements.txt`: Python 依存
- `Dockerfile`: Cloud Run 用コンテナ
- `ui/`: Vercel 配備用の静的UI
  - `ui/index.html`
  - `ui/app.js`
  - `ui/styles.css`
  - `ui/vercel.json`

## 必要な環境変数
- `GCS_BUCKET_NAME` (default: `agridx`)
- `GCS_FOLDER_PREFIX` (default: `統合生命科学特論/`)
- `GOOGLE_CLOUD_PROJECT` (ローカル実行時に必要)
- `ALLOWED_ORIGINS` (任意, 例: `https://ui-tawny-one.vercel.app`)

## API エンドポイント
- `GET /` : ヘルスチェック
- `GET /files` : ファイル一覧
- `POST /upload` : ファイルアップロード (`multipart/form-data`, field: `file`)
- `GET /download/<filename>` : ファイルダウンロード
- `DELETE /delete/<filename>` : ファイル削除

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
  --set-env-vars GCS_BUCKET_NAME=agridx,GCS_FOLDER_PREFIX="統合生命科学特論/",ALLOWED_ORIGINS="https://ui-tawny-one.vercel.app"
```

## Vercel UI での確認
1. `ui` を Vercel にデプロイ
2. UIを開き `Backend URL` に Cloud Run URL を入力
3. `Health Check` -> `Refresh` -> Upload/Download/Delete で動作確認

## IAM
Cloud Run のサービスアカウントに最低限以下を付与:
- `Storage Object Admin`（検証用）
