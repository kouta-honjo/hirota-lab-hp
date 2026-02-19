import os
import posixpath
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from google.cloud import storage
from io import BytesIO

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": os.environ.get("ALLOWED_ORIGINS", "*").split(",")}})

# 環境変数からバケット名とフォルダプレフィックスを取得
# Cloud Runデプロイ時に設定します
GCS_BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME', 'agridx')
GCS_FOLDER_PREFIX = os.environ.get('GCS_FOLDER_PREFIX', '統合生命科学特論/') # 末尾のスラッシュは重要


def _get_bucket():
    # Delay client creation until request time so import-time crashes do not occur
    # on platforms where project/env is injected at runtime (e.g. serverless).
    project = os.environ.get('GOOGLE_CLOUD_PROJECT') or os.environ.get('GCP_PROJECT')
    client = storage.Client(project=project) if project else storage.Client()
    return client.bucket(GCS_BUCKET_NAME)

def _safe_object_name(filename: str) -> str:
    # GCS object names use '/' separators. Prevent path traversal and absolute paths.
    if not filename:
        raise ValueError('Empty filename')
    normalized = filename.replace('\\', '/').lstrip('/')
    parts = [p for p in normalized.split('/') if p not in ('', '.')]
    if any(p == '..' for p in parts):
        raise ValueError('Invalid path')
    return '/'.join(parts)

def _blob_name(filename: str) -> str:
    safe_name = _safe_object_name(filename)
    # Use POSIX join to avoid backslashes on Windows
    return posixpath.join(GCS_FOLDER_PREFIX, safe_name)

@app.route('/')
def hello():
    return 'GCS File Management API is running!'

# ファイル一覧の取得
@app.route('/files', methods=['GET'])
def list_files():
    try:
        bucket = _get_bucket()
    except Exception as e:
        return jsonify({'error': f'Storage client initialization failed: {e}'}), 500
    blobs = bucket.list_blobs(prefix=GCS_FOLDER_PREFIX)
    
    file_list = []
    for blob in blobs:
        # フォルダ自身や空のオブジェクトを除外
        if blob.name != GCS_FOLDER_PREFIX and not blob.name.endswith('/'):
            file_list.append({
                'name': os.path.basename(blob.name), # フォルダプレフィックスなしのファイル名
                'full_path': blob.name,
                'size': blob.size,
                'updated': blob.updated.isoformat() if blob.updated else None,
                'md5_hash': blob.md5_hash,
                'content_type': blob.content_type
            })
    return jsonify(file_list)

# ファイルのダウンロード
@app.route('/download/<path:filename>', methods=['GET'])
def download_file(filename):
    try:
        bucket = _get_bucket()
    except Exception as e:
        return jsonify({'error': f'Storage client initialization failed: {e}'}), 500
    try:
        blob_name = _blob_name(filename)
    except ValueError:
        return jsonify({'error': 'Invalid file path'}), 400
    blob = bucket.blob(blob_name)

    if not blob.exists():
        return jsonify({'error': 'File not found'}), 404

    try:
        # ファイルの内容をメモリに読み込む
        file_content = BytesIO()
        blob.download_to_file(file_content)
        file_content.seek(0) # ストリームの先頭に戻す
        
        return send_file(
            file_content,
            mimetype=blob.content_type if blob.content_type else 'application/octet-stream',
            as_attachment=True,
            download_name=filename # クライアントに表示されるファイル名
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ファイルのアップロード
@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part in the request'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file:
        try:
            bucket = _get_bucket()
        except Exception as e:
            return jsonify({'error': f'Storage client initialization failed: {e}'}), 500
        try:
            destination_blob_name = _blob_name(file.filename)
        except ValueError:
            return jsonify({'error': 'Invalid file path'}), 400
        blob = bucket.blob(destination_blob_name)

        try:
            blob.upload_from_file(file)
            return jsonify({'message': f'File {file.filename} uploaded successfully to {destination_blob_name}'}), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

# ファイルの削除
@app.route('/delete/<path:filename>', methods=['DELETE'])
def delete_file(filename):
    try:
        bucket = _get_bucket()
    except Exception as e:
        return jsonify({'error': f'Storage client initialization failed: {e}'}), 500
    try:
        blob_name = _blob_name(filename)
    except ValueError:
        return jsonify({'error': 'Invalid file path'}), 400
    blob = bucket.blob(blob_name)

    if not blob.exists():
        return jsonify({'error': 'File not found'}), 404

    try:
        blob.delete()
        return jsonify({'message': f'File {filename} deleted successfully from {blob_name}'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # ローカルテスト用 (本番環境ではCloud RunがGunicornなどを介して実行)
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))

