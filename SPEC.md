# 仏青会館ホームページ 管理者機能 仕様（ドラフト）

## 目的
管理者画面から以下の内容をGUIで管理し、GCSをファイルシステムとして利用する。
- TOPページのニュースリリース投稿
- 行事予定の編集

## 保存先（GCS）
- バケット: `GCS_BUCKET_NAME`
- プレフィックス: `GCS_FOLDER_PREFIX`
- CMS領域: `CMS_PREFIX`（デフォルト `cms/`）
- 実体ファイル:
  - `GCS_FOLDER_PREFIX/CMS_PREFIX/news.json`
  - `GCS_FOLDER_PREFIX/CMS_PREFIX/events.json`

## データ構造
ニュース (`news.json`)
```json
{
  "updated_at": "2026-02-20T00:00:00Z",
  "items": [
    {
      "id": 1,
      "title": "記事タイトル",
      "body": "本文",
      "date": "2026-02-20",
      "link": "https://example.com/optional",
      "visible": true,
      "created_at": "2026-02-20T00:00:00Z",
      "updated_at": "2026-02-20T00:00:00Z"
    }
  ]
}
```

行事予定 (`events.json`)
```json
{
  "updated_at": "2026-02-20T00:00:00Z",
  "items": [
    {
      "id": 1,
      "title": "行事タイトル",
      "date": "2026-02-20",
      "time_start": "18:00",
      "time_end": "20:00",
      "location": "会館",
      "description": "概要",
      "link": "https://example.com/optional",
      "visible": true,
      "created_at": "2026-02-20T00:00:00Z",
      "updated_at": "2026-02-20T00:00:00Z"
    }
  ]
}
```

## API
ニュース
- `GET /content/news` 一覧取得
- `POST /content/news` 作成
- `PUT /content/news/<id>` 更新
- `DELETE /content/news/<id>` 削除

行事予定
- `GET /content/events` 一覧取得
- `POST /content/events` 作成
- `PUT /content/events/<id>` 更新
- `DELETE /content/events/<id>` 削除

公開
- `GET /public/news` 公開ニュース取得
- `GET /public/events` 公開行事予定取得

## 管理画面（UI）
共通
- Backend URL入力
- ヘルスチェック
- Google OAuth サインイン（管理者のみ操作可）
- 変更は即時GCSへ反映

ニュースリリース
- 入力: タイトル、日付、本文、リンク（任意）、表示/非表示
- 一覧: 日付降順、編集・削除

行事予定
- 入力: タイトル、日付、開始/終了時刻、場所、説明、リンク（任意）、表示/非表示
- 一覧: 日付降順、編集・削除

## 運用メモ
- GCS上のJSONを直接参照することでWeb側の表示にも流用可能
- 認証はGoogle OAuth（IDトークン検証）
- 完成後に README へ公開HP/管理画面のURLを記載する
