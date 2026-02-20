import os
import json
from datetime import datetime, timezone
from io import BytesIO

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from google.oauth2 import id_token, service_account
from google.auth.transport import requests as google_requests
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": os.environ.get("ALLOWED_ORIGINS", "*").split(",")}})

# --- Configuration ---
GOOGLE_DRIVE_FOLDER_ID = os.environ.get('GOOGLE_DRIVE_FOLDER_ID', '148ZjrTFSswynlTVEydDzF3_LpAs-8cg8')
CMS_PREFIX = os.environ.get('CMS_PREFIX', 'cms')
GOOGLE_OAUTH_CLIENT_ID = os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '')
ADMIN_ALLOW_EMAILS = os.environ.get('ADMIN_ALLOW_EMAILS', '')
SERVICE_ACCOUNT_FILE = os.environ.get('SERVICE_ACCOUNT_FILE', 'ihomework1-b1a2db2949de.json')

# --- Google Drive Helpers ---
_drive_service = None

def _get_drive_service():
    global _drive_service
    if _drive_service is not None:
        return _drive_service
    scopes = ['https://www.googleapis.com/auth/drive']
    creds = None
    if os.path.exists(SERVICE_ACCOUNT_FILE):
        creds = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=scopes)
    else:
        from google.auth import default
        creds, _ = default(scopes=scopes)
    _drive_service = build('drive', 'v3', credentials=creds)
    return _drive_service


def _find_file(name, folder_id=None):
    """Search for a file by name in the given folder. Returns file metadata or None."""
    service = _get_drive_service()
    folder = folder_id or GOOGLE_DRIVE_FOLDER_ID
    q = f"name = '{name}' and '{folder}' in parents and trashed = false"
    result = service.files().list(q=q, fields='files(id, name, mimeType, size, modifiedTime)',
                                  pageSize=1).execute()
    files = result.get('files', [])
    return files[0] if files else None


def _find_or_create_folder(name, parent_id=None):
    """Find or create a subfolder inside the parent folder."""
    parent = parent_id or GOOGLE_DRIVE_FOLDER_ID
    existing = _find_file(name, parent)
    if existing and existing.get('mimeType') == 'application/vnd.google-apps.folder':
        return existing['id']
    service = _get_drive_service()
    metadata = {
        'name': name,
        'mimeType': 'application/vnd.google-apps.folder',
        'parents': [parent]
    }
    folder = service.files().create(body=metadata, fields='id').execute()
    return folder['id']


def _get_cms_folder_id():
    """Get or create the CMS subfolder inside the Drive folder."""
    return _find_or_create_folder(CMS_PREFIX)


def _read_drive_json(filename):
    """Read a JSON file from the CMS folder on Drive."""
    cms_folder = _get_cms_folder_id()
    file_meta = _find_file(filename, cms_folder)
    if not file_meta:
        return None
    service = _get_drive_service()
    req = service.files().get_media(fileId=file_meta['id'])
    buf = BytesIO()
    downloader = MediaIoBaseDownload(buf, req)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    buf.seek(0)
    try:
        return json.loads(buf.read().decode('utf-8'))
    except Exception:
        return None


def _write_drive_json(filename, data):
    """Write/update a JSON file in the CMS folder on Drive."""
    cms_folder = _get_cms_folder_id()
    body = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
    media = MediaIoBaseUpload(BytesIO(body), mimetype='application/json', resumable=False)
    service = _get_drive_service()
    existing = _find_file(filename, cms_folder)
    if existing:
        service.files().update(fileId=existing['id'], media_body=media).execute()
    else:
        metadata = {'name': filename, 'parents': [cms_folder]}
        service.files().create(body=metadata, media_body=media, fields='id').execute()


def _list_drive_files(folder_id=None):
    """List files in a Drive folder."""
    service = _get_drive_service()
    fid = folder_id or GOOGLE_DRIVE_FOLDER_ID
    results = []
    page_token = None
    while True:
        resp = service.files().list(
            q=f"'{fid}' in parents and trashed = false",
            fields='nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink)',
            pageSize=100,
            pageToken=page_token
        ).execute()
        results.extend(resp.get('files', []))
        page_token = resp.get('nextPageToken')
        if not page_token:
            break
    return results


# --- Auth Helpers ---
def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


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


def _next_id(items):
    max_id = 0
    for item in items:
        try:
            max_id = max(max_id, int(item.get('id', 0)))
        except Exception:
            continue
    return max_id + 1


# --- Content CRUD Generic ---
def _init_payload():
    return {'updated_at': _utc_now_iso(), 'items': []}


def _read_content(filename):
    data = _read_drive_json(filename)
    if data and isinstance(data, dict):
        return data
    return _init_payload()


def _write_content(filename, payload):
    _write_drive_json(filename, payload)


# --- Validation ---
def _validate_news_input(payload, for_update=False):
    errors = []
    if not for_update or 'title' in payload:
        title = payload.get('title')
        if not isinstance(title, str) or not title.strip():
            errors.append('title is required')
    if not for_update or 'body' in payload:
        body = payload.get('body')
        if not isinstance(body, str) or not body.strip():
            errors.append('body is required')
    if not for_update or 'date' in payload:
        date = payload.get('date')
        if not isinstance(date, str) or not date.strip():
            errors.append('date is required')
    return errors


def _validate_event_input(payload, for_update=False):
    errors = []
    if not for_update or 'title' in payload:
        title = payload.get('title')
        if not isinstance(title, str) or not title.strip():
            errors.append('title is required')
    if not for_update or 'date' in payload:
        date = payload.get('date')
        if not isinstance(date, str) or not date.strip():
            errors.append('date is required')
    return errors


def _validate_member_input(payload, for_update=False):
    errors = []
    if not for_update or 'name' in payload:
        name = payload.get('name')
        if not isinstance(name, str) or not name.strip():
            errors.append('name is required')
    return errors


def _validate_publication_input(payload, for_update=False):
    errors = []
    if not for_update or 'title' in payload:
        title = payload.get('title')
        if not isinstance(title, str) or not title.strip():
            errors.append('title is required')
    return errors


def _validate_research_input(payload, for_update=False):
    errors = []
    if not for_update or 'title' in payload:
        title = payload.get('title')
        if not isinstance(title, str) or not title.strip():
            errors.append('title is required')
    return errors


# ============================================================
# Routes
# ============================================================

@app.route('/')
def hello():
    return 'Hirota Lab CMS API is running!'


# --- Drive File Browser ---
@app.route('/drive/files', methods=['GET'])
def drive_list_files():
    try:
        folder_id = request.args.get('folder_id', GOOGLE_DRIVE_FOLDER_ID)
        files = _list_drive_files(folder_id)
        return jsonify(files)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/drive/file/<file_id>', methods=['GET'])
def drive_get_file(file_id):
    try:
        service = _get_drive_service()
        meta = service.files().get(fileId=file_id, fields='id,name,mimeType,size').execute()
        req = service.files().get_media(fileId=file_id)
        buf = BytesIO()
        downloader = MediaIoBaseDownload(buf, req)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        buf.seek(0)
        return send_file(
            buf,
            mimetype=meta.get('mimeType', 'application/octet-stream'),
            as_attachment=True,
            download_name=meta.get('name', 'file')
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# --- Upload File to Drive ---
@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part in the request'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    try:
        service = _get_drive_service()
        metadata = {'name': file.filename, 'parents': [GOOGLE_DRIVE_FOLDER_ID]}
        media = MediaIoBaseUpload(file.stream, mimetype=file.content_type or 'application/octet-stream')
        created = service.files().create(body=metadata, media_body=media, fields='id,name').execute()
        return jsonify({'message': f'File {file.filename} uploaded', 'id': created['id']}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# --- Delete File from Drive ---
@app.route('/delete/<file_id>', methods=['DELETE'])
def delete_file(file_id):
    try:
        service = _get_drive_service()
        service.files().delete(fileId=file_id).execute()
        return jsonify({'message': 'File deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# --- List files (legacy compat) ---
@app.route('/files', methods=['GET'])
def list_files():
    try:
        files = _list_drive_files()
        file_list = []
        for f in files:
            file_list.append({
                'name': f.get('name', ''),
                'id': f.get('id', ''),
                'size': f.get('size'),
                'updated': f.get('modifiedTime'),
                'content_type': f.get('mimeType', ''),
                'webViewLink': f.get('webViewLink', '')
            })
        return jsonify(file_list)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================
# NEWS CRUD
# ============================================================
@app.route('/content/news', methods=['GET'])
def get_news():
    try:
        payload = _read_content('news.json')
        return jsonify(payload)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/content/news', methods=['POST'])
def create_news():
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    data = request.get_json(silent=True) or {}
    errors = _validate_news_input(data)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400
    try:
        payload = _read_content('news.json')
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
        _write_content('news.json', payload)
        return jsonify(item), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/content/news/<int:item_id>', methods=['PUT'])
def update_news(item_id):
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    data = request.get_json(silent=True) or {}
    errors = _validate_news_input(data, for_update=True)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400
    try:
        payload = _read_content('news.json')
        items = payload.get('items', [])
        now = _utc_now_iso()
        for item in items:
            if item.get('id') == item_id:
                for key in ('title', 'body', 'date', 'link'):
                    if key in data:
                        item[key] = (data.get(key) or '').strip()
                if 'visible' in data:
                    item['visible'] = bool(data.get('visible'))
                item['updated_at'] = now
                payload['updated_at'] = now
                _write_content('news.json', payload)
                return jsonify(item)
        return jsonify({'error': 'Item not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/content/news/<int:item_id>', methods=['DELETE'])
def delete_news(item_id):
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    try:
        payload = _read_content('news.json')
        items = payload.get('items', [])
        remaining = [i for i in items if i.get('id') != item_id]
        if len(remaining) == len(items):
            return jsonify({'error': 'Item not found'}), 404
        payload['items'] = remaining
        payload['updated_at'] = _utc_now_iso()
        _write_content('news.json', payload)
        return jsonify({'message': 'Deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================
# EVENTS CRUD
# ============================================================
@app.route('/content/events', methods=['GET'])
def get_events():
    try:
        payload = _read_content('events.json')
        return jsonify(payload)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/content/events', methods=['POST'])
def create_event():
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    data = request.get_json(silent=True) or {}
    errors = _validate_event_input(data)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400
    try:
        payload = _read_content('events.json')
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
        _write_content('events.json', payload)
        return jsonify(item), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/content/events/<int:item_id>', methods=['PUT'])
def update_event(item_id):
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    data = request.get_json(silent=True) or {}
    errors = _validate_event_input(data, for_update=True)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400
    try:
        payload = _read_content('events.json')
        items = payload.get('items', [])
        now = _utc_now_iso()
        for item in items:
            if item.get('id') == item_id:
                for key in ('title', 'date', 'time_start', 'time_end', 'location', 'description', 'link'):
                    if key in data:
                        item[key] = (data.get(key) or '').strip()
                if 'visible' in data:
                    item['visible'] = bool(data.get('visible'))
                item['updated_at'] = now
                payload['updated_at'] = now
                _write_content('events.json', payload)
                return jsonify(item)
        return jsonify({'error': 'Item not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/content/events/<int:item_id>', methods=['DELETE'])
def delete_event(item_id):
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    try:
        payload = _read_content('events.json')
        items = payload.get('items', [])
        remaining = [i for i in items if i.get('id') != item_id]
        if len(remaining) == len(items):
            return jsonify({'error': 'Item not found'}), 404
        payload['items'] = remaining
        payload['updated_at'] = _utc_now_iso()
        _write_content('events.json', payload)
        return jsonify({'message': 'Deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================
# MEMBERS CRUD
# ============================================================
@app.route('/content/members', methods=['GET'])
def get_members():
    try:
        payload = _read_content('members.json')
        return jsonify(payload)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/content/members', methods=['POST'])
def create_member():
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    data = request.get_json(silent=True) or {}
    errors = _validate_member_input(data)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400
    try:
        payload = _read_content('members.json')
        items = payload.get('items', [])
        now = _utc_now_iso()
        item = {
            'id': _next_id(items),
            'name': data.get('name', '').strip(),
            'name_en': (data.get('name_en') or '').strip(),
            'role': (data.get('role') or 'bachelor').strip(),
            'title': (data.get('title') or '').strip(),
            'research_interest': (data.get('research_interest') or '').strip(),
            'photo_url': (data.get('photo_url') or '').strip(),
            'email': (data.get('email') or '').strip(),
            'year_joined': data.get('year_joined', ''),
            'order': data.get('order', 99),
            'visible': bool(data.get('visible', True)),
            'created_at': now,
            'updated_at': now
        }
        items.append(item)
        payload['items'] = items
        payload['updated_at'] = now
        _write_content('members.json', payload)
        return jsonify(item), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/content/members/<int:item_id>', methods=['PUT'])
def update_member(item_id):
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    data = request.get_json(silent=True) or {}
    errors = _validate_member_input(data, for_update=True)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400
    try:
        payload = _read_content('members.json')
        items = payload.get('items', [])
        now = _utc_now_iso()
        for item in items:
            if item.get('id') == item_id:
                for key in ('name', 'name_en', 'role', 'title', 'research_interest',
                            'photo_url', 'email'):
                    if key in data:
                        item[key] = (data.get(key) or '').strip()
                if 'year_joined' in data:
                    item['year_joined'] = data.get('year_joined', '')
                if 'order' in data:
                    item['order'] = data.get('order', 99)
                if 'visible' in data:
                    item['visible'] = bool(data.get('visible'))
                item['updated_at'] = now
                payload['updated_at'] = now
                _write_content('members.json', payload)
                return jsonify(item)
        return jsonify({'error': 'Item not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/content/members/<int:item_id>', methods=['DELETE'])
def delete_member(item_id):
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    try:
        payload = _read_content('members.json')
        items = payload.get('items', [])
        remaining = [i for i in items if i.get('id') != item_id]
        if len(remaining) == len(items):
            return jsonify({'error': 'Item not found'}), 404
        payload['items'] = remaining
        payload['updated_at'] = _utc_now_iso()
        _write_content('members.json', payload)
        return jsonify({'message': 'Deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================
# PUBLICATIONS CRUD
# ============================================================
@app.route('/content/publications', methods=['GET'])
def get_publications():
    try:
        payload = _read_content('publications.json')
        return jsonify(payload)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/content/publications', methods=['POST'])
def create_publication():
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    data = request.get_json(silent=True) or {}
    errors = _validate_publication_input(data)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400
    try:
        payload = _read_content('publications.json')
        items = payload.get('items', [])
        now = _utc_now_iso()
        item = {
            'id': _next_id(items),
            'title': data.get('title', '').strip(),
            'authors': (data.get('authors') or '').strip(),
            'journal': (data.get('journal') or '').strip(),
            'year': (data.get('year') or '').strip() if isinstance(data.get('year'), str) else str(data.get('year', '')),
            'volume': (data.get('volume') or '').strip() if isinstance(data.get('volume'), str) else str(data.get('volume', '')),
            'pages': (data.get('pages') or '').strip(),
            'doi': (data.get('doi') or '').strip(),
            'category': (data.get('category') or 'paper').strip(),
            'visible': bool(data.get('visible', True)),
            'order': data.get('order', 99),
            'created_at': now,
            'updated_at': now
        }
        items.append(item)
        payload['items'] = items
        payload['updated_at'] = now
        _write_content('publications.json', payload)
        return jsonify(item), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/content/publications/<int:item_id>', methods=['PUT'])
def update_publication(item_id):
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    data = request.get_json(silent=True) or {}
    errors = _validate_publication_input(data, for_update=True)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400
    try:
        payload = _read_content('publications.json')
        items = payload.get('items', [])
        now = _utc_now_iso()
        for item in items:
            if item.get('id') == item_id:
                for key in ('title', 'authors', 'journal', 'year', 'volume', 'pages', 'doi', 'category'):
                    if key in data:
                        val = data.get(key) or ''
                        item[key] = val.strip() if isinstance(val, str) else str(val)
                if 'order' in data:
                    item['order'] = data.get('order', 99)
                if 'visible' in data:
                    item['visible'] = bool(data.get('visible'))
                item['updated_at'] = now
                payload['updated_at'] = now
                _write_content('publications.json', payload)
                return jsonify(item)
        return jsonify({'error': 'Item not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/content/publications/<int:item_id>', methods=['DELETE'])
def delete_publication(item_id):
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    try:
        payload = _read_content('publications.json')
        items = payload.get('items', [])
        remaining = [i for i in items if i.get('id') != item_id]
        if len(remaining) == len(items):
            return jsonify({'error': 'Item not found'}), 404
        payload['items'] = remaining
        payload['updated_at'] = _utc_now_iso()
        _write_content('publications.json', payload)
        return jsonify({'message': 'Deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================
# RESEARCH CRUD
# ============================================================
@app.route('/content/research', methods=['GET'])
def get_research():
    try:
        payload = _read_content('research.json')
        return jsonify(payload)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/content/research', methods=['POST'])
def create_research():
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    data = request.get_json(silent=True) or {}
    errors = _validate_research_input(data)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400
    try:
        payload = _read_content('research.json')
        items = payload.get('items', [])
        now = _utc_now_iso()
        item = {
            'id': _next_id(items),
            'title': data.get('title', '').strip(),
            'title_en': (data.get('title_en') or '').strip(),
            'description': (data.get('description') or '').strip(),
            'image_url': (data.get('image_url') or '').strip(),
            'order': data.get('order', 99),
            'visible': bool(data.get('visible', True)),
            'created_at': now,
            'updated_at': now
        }
        items.append(item)
        payload['items'] = items
        payload['updated_at'] = now
        _write_content('research.json', payload)
        return jsonify(item), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/content/research/<int:item_id>', methods=['PUT'])
def update_research(item_id):
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    data = request.get_json(silent=True) or {}
    errors = _validate_research_input(data, for_update=True)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400
    try:
        payload = _read_content('research.json')
        items = payload.get('items', [])
        now = _utc_now_iso()
        for item in items:
            if item.get('id') == item_id:
                for key in ('title', 'title_en', 'description', 'image_url'):
                    if key in data:
                        item[key] = (data.get(key) or '').strip()
                if 'order' in data:
                    item['order'] = data.get('order', 99)
                if 'visible' in data:
                    item['visible'] = bool(data.get('visible'))
                item['updated_at'] = now
                payload['updated_at'] = now
                _write_content('research.json', payload)
                return jsonify(item)
        return jsonify({'error': 'Item not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/content/research/<int:item_id>', methods=['DELETE'])
def delete_research(item_id):
    ok, reason = _require_admin()
    if not ok:
        return jsonify({'error': reason}), 401
    try:
        payload = _read_content('research.json')
        items = payload.get('items', [])
        remaining = [i for i in items if i.get('id') != item_id]
        if len(remaining) == len(items):
            return jsonify({'error': 'Item not found'}), 404
        payload['items'] = remaining
        payload['updated_at'] = _utc_now_iso()
        _write_content('research.json', payload)
        return jsonify({'message': 'Deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================
# PUBLIC READ-ONLY ENDPOINTS
# ============================================================
@app.route('/public/news', methods=['GET'])
def public_news():
    try:
        payload = _read_content('news.json')
        items = [i for i in payload.get('items', []) if i.get('visible', True)]
        items.sort(key=lambda x: x.get('date', ''), reverse=True)
        return jsonify({'items': items})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/public/events', methods=['GET'])
def public_events():
    try:
        payload = _read_content('events.json')
        items = [i for i in payload.get('items', []) if i.get('visible', True)]
        items.sort(key=lambda x: x.get('date', ''), reverse=True)
        return jsonify({'items': items})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/public/members', methods=['GET'])
def public_members():
    try:
        payload = _read_content('members.json')
        items = [i for i in payload.get('items', []) if i.get('visible', True)]
        items.sort(key=lambda x: x.get('order', 99))
        return jsonify({'items': items})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/public/publications', methods=['GET'])
def public_publications():
    try:
        payload = _read_content('publications.json')
        items = [i for i in payload.get('items', []) if i.get('visible', True)]
        items.sort(key=lambda x: x.get('year', ''), reverse=True)
        return jsonify({'items': items})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/public/research', methods=['GET'])
def public_research():
    try:
        payload = _read_content('research.json')
        items = [i for i in payload.get('items', []) if i.get('visible', True)]
        items.sort(key=lambda x: x.get('order', 99))
        return jsonify({'items': items})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
