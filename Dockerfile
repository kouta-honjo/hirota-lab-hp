# ベースイメージ
FROM python:3.9-slim-buster

# 作業ディレクトリを設定
WORKDIR /app

# 依存関係をコピーしてインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションコードをコピー
COPY . .

# サービスがリッスンするポートを定義
ENV PORT 8080

# アプリケーションの実行コマンド
# Gunicorn を使用して Flask アプリケーションを起動
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 main:app
