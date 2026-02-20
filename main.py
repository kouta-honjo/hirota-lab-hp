import os
import posixpath
import json
from datetime import datetime, timezone
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from google.cloud import storage
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from io import BytesIO

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": os.environ.get("ALLOWED_ORIGINS", "*").split(",")}})

# 環境変数からバケット名とフォルダプレフィックスを取得
# Cloud Runデプロイ時に設定します
GCS_BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME', 'agridx')
GCS_FOLDER_PREFIX = os.environ.get('GCS_FOLDER_PREFIX', '統合生命科学特論/') # 末尾のスラッシュは重要
CMS_PREFIX = os.environ.get('CMS_PREFIX', 'cms/')
GOOGLE_OAUTH_CLIENT_ID = os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '')
ADMIN_ALLOW_EMAILS = os.environ.get('ADMIN_ALLOW_EMAILS', '')


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

def _cms_blob_name(filename: str) -> str:
    safe_name = _safe_object_name(filename)
    return posixpath.join(GCS_FOLDER_PREFIX, CMS_PREFIX, safe_name)

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _read_json_blob(blob_name: str, default_payload: dict) -> dict:
    bucket = _get_bucket()
    blob = bucket.blob(blob_name)
    if not blob.exists():
        return default_payload
    data = blob.download_as_bytes()
    if not data:
        return default_payload
    try:
        payload = json.loads(data.decode('utf-8'))
    except Exception:
        return default_payload
    return payload if isinstance(payload, dict) else default_payload

def _write_json_blob(blob_name: str, payload: dict) -> None:
    bucket = _get_bucket()
    blob = bucket.blob(blob_name)
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    blob.upload_from_string(body, content_type='application/json; charset=utf-8')

def _get_allow_email_set():
    return {e.strip().lower() for e in ADMIN_ALLOW_EMAILS.split(',') if e.strip()}

def _require_admin():
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return False, 'Missing bearer token'
    token = auth_header.split(' ', 1)[1].strip()
    if not token:
        return False, 'Missing bearer token'
    if not GOOGLE_OAUTH_CLIENT_ID:
        return False, 'OAuth client id not configured'
    allowed = _get_allow_email_set()
    if not allowed:
        return False, 'Admin allow list not configured'
    try:
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), audience=GOOGLE_OAUTH_CLIENT_ID)
    except Exception as e:
        return False, f'Invalid token: {e}'
    email = (idinfo.get('email') or '').lower()
    if not email:
        return False, 'Email missing in token'
    if email not in allowed:
        return False, 'Not authorized'
    return True, email

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

def _init_news_payload():
    return {
        'updated_at': _utc_now_iso(),
        'items': []
    }

def _init_events_payload():
    return {
        'updated_at': _utc_now_iso(),
        'items': []
    }

def _next_id(items):
    max_id = 0
    for item in items:
        try:
            max_id = max(max_id, int(item.get('id', 0)))
        except Exception:
            continue
    return max_id + 1

def _validate_news_input(payload: dict, for_update: bool = False):
    errors = []
    title = payload.get('title')
    body = payload.get('body')
    date = payload.get('date')
    if not for_update or 'title' in payload:
        if not isinstance(title, str) or not title.strip():
            errors.append('title is required')
    if not for_update or 'body' in payload:
        if not isinstance(body, str) or not body.strip():
            errors.append('body is required')
    if not for_update or 'date' in payload:
        if not isinstance(date, str) or not date.strip():
            errors.append('date is required')
    return errors

def _validate_event_input(payload: dict, for_update: bool = False):
    errors = []
    title = payload.get('title')
    date = payload.get('date')
    if not for_update or 'title' in payload:
        if not isinstance(title, str) or not title.strip():
            errors.append('title is required')
    if not for_update or 'date' in payload:
        if not isinstance(date, str) or not date.strip():
            errors.append('date is required')
    return errors

@app.route('/content/news', methods=['GET'])
def get_news():
    try:
        blob_name = _cms_blob_name('news.json')
        payload = _read_json_blob(blob_name, _init_news_payload())
        return jsonify(payload)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/content/news', methods=['POST'])
def create_news():
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    data = request.get_json(silent=True) or {}
    errors = _validate_news_input(data, for_update=False)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400
    try:
        blob_name = _cms_blob_name('news.json')
        payload = _read_json_blob(blob_name, _init_news_payload())
        items = payload.get('items', [])
        now = _utc_now_iso()
        item = {
            'id': _next_id(items),
            'title': data.get('title', '').strip(),
            'body': data.get('body', '').strip(),
            'date': data.get('date', '').strip(),
            'link': (data.get('link') or '').strip(),
            'visible': bool(data.get('visible', True)),
            'created_at': now,
            'updated_at': now
        }
        items.append(item)
        payload['items'] = items
        payload['updated_at'] = now
        _write_json_blob(blob_name, payload)
        return jsonify(item), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/content/news/<int:item_id>', methods=['PUT'])
def update_news(item_id: int):
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    data = request.get_json(silent=True) or {}
    errors = _validate_news_input(data, for_update=True)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400
    try:
        blob_name = _cms_blob_name('news.json')
        payload = _read_json_blob(blob_name, _init_news_payload())
        items = payload.get('items', [])
        now = _utc_now_iso()
        for item in items:
            if item.get('id') == item_id:
                if 'title' in data:
                    item['title'] = data.get('title', '').strip()
                if 'body' in data:
                    item['body'] = data.get('body', '').strip()
                if 'date' in data:
                    item['date'] = data.get('date', '').strip()
                if 'link' in data:
                    item['link'] = (data.get('link') or '').strip()
                if 'visible' in data:
                    item['visible'] = bool(data.get('visible'))
                item['updated_at'] = now
                payload['updated_at'] = now
                _write_json_blob(blob_name, payload)
                return jsonify(item)
        return jsonify({'error': 'Item not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/content/news/<int:item_id>', methods=['DELETE'])
def delete_news(item_id: int):
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    try:
        blob_name = _cms_blob_name('news.json')
        payload = _read_json_blob(blob_name, _init_news_payload())
        items = payload.get('items', [])
        remaining = [item for item in items if item.get('id') != item_id]
        if len(remaining) == len(items):
            return jsonify({'error': 'Item not found'}), 404
        payload['items'] = remaining
        payload['updated_at'] = _utc_now_iso()
        _write_json_blob(blob_name, payload)
        return jsonify({'message': 'Deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/content/events', methods=['GET'])
def get_events():
    try:
        blob_name = _cms_blob_name('events.json')
        payload = _read_json_blob(blob_name, _init_events_payload())
        return jsonify(payload)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/content/events', methods=['POST'])
def create_event():
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    data = request.get_json(silent=True) or {}
    errors = _validate_event_input(data, for_update=False)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400
    try:
        blob_name = _cms_blob_name('events.json')
        payload = _read_json_blob(blob_name, _init_events_payload())
        items = payload.get('items', [])
        now = _utc_now_iso()
        item = {
            'id': _next_id(items),
            'title': data.get('title', '').strip(),
            'date': data.get('date', '').strip(),
            'time_start': (data.get('time_start') or '').strip(),
            'time_end': (data.get('time_end') or '').strip(),
            'location': (data.get('location') or '').strip(),
            'description': (data.get('description') or '').strip(),
            'link': (data.get('link') or '').strip(),
            'visible': bool(data.get('visible', True)),
            'created_at': now,
            'updated_at': now
        }
        items.append(item)
        payload['items'] = items
        payload['updated_at'] = now
        _write_json_blob(blob_name, payload)
        return jsonify(item), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/content/events/<int:item_id>', methods=['PUT'])
def update_event(item_id: int):
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    data = request.get_json(silent=True) or {}
    errors = _validate_event_input(data, for_update=True)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400
    try:
        blob_name = _cms_blob_name('events.json')
        payload = _read_json_blob(blob_name, _init_events_payload())
        items = payload.get('items', [])
        now = _utc_now_iso()
        for item in items:
            if item.get('id') == item_id:
                if 'title' in data:
                    item['title'] = data.get('title', '').strip()
                if 'date' in data:
                    item['date'] = data.get('date', '').strip()
                if 'time_start' in data:
                    item['time_start'] = (data.get('time_start') or '').strip()
                if 'time_end' in data:
                    item['time_end'] = (data.get('time_end') or '').strip()
                if 'location' in data:
                    item['location'] = (data.get('location') or '').strip()
                if 'description' in data:
                    item['description'] = (data.get('description') or '').strip()
                if 'link' in data:
                    item['link'] = (data.get('link') or '').strip()
                if 'visible' in data:
                    item['visible'] = bool(data.get('visible'))
                item['updated_at'] = now
                payload['updated_at'] = now
                _write_json_blob(blob_name, payload)
                return jsonify(item)
        return jsonify({'error': 'Item not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/content/events/<int:item_id>', methods=['DELETE'])
def delete_event(item_id: int):
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    try:
        blob_name = _cms_blob_name('events.json')
        payload = _read_json_blob(blob_name, _init_events_payload())
        items = payload.get('items', [])
        remaining = [item for item in items if item.get('id') != item_id]
        if len(remaining) == len(items):
            return jsonify({'error': 'Item not found'}), 404
        payload['items'] = remaining
        payload['updated_at'] = _utc_now_iso()
        _write_json_blob(blob_name, payload)
        return jsonify({'message': 'Deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # ローカルテスト用 (本番環境ではCloud RunがGunicornなどを介して実行)
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))

@app.route('/public/news', methods=['GET'])
def public_news():
    try:
        blob_name = _cms_blob_name('news.json')
        payload = _read_json_blob(blob_name, _init_news_payload())
        items = [item for item in payload.get('items', []) if item.get('visible', True)]
        items.sort(key=lambda x: x.get('date', ''), reverse=True)
        return jsonify({'items': items})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/public/events', methods=['GET'])
def public_events():
    try:
        blob_name = _cms_blob_name('events.json')
        payload = _read_json_blob(blob_name, _init_events_payload())
        items = [item for item in payload.get('items', []) if item.get('visible', True)]
        items.sort(key=lambda x: x.get('date', ''), reverse=True)
        return jsonify({'items': items})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
