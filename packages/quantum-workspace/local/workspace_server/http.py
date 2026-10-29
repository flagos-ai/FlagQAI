"""Same-origin loopback HTTP adapter. No provider calls belong in this layer."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from http.client import HTTPConnection, HTTPException
from pathlib import Path
import re
import socket
from urllib.parse import unquote, urlsplit, parse_qs

from quantum_workspace_protocol import LIMITS
from .service import QueueFullError
from .editor_files import create_model, read_model
from .history_preferences import history_trash
from .bridge import WorkspaceBridge, BridgeConflict
from .python_runs import PythonRuns
from .experiments import ExperimentImports, MAX_UPLOAD_BYTES


def create_server(settings, service):
    experiments = ExperimentImports(settings)
    python_runs = PythonRuns(settings, service, experiments)
    bridge = WorkspaceBridge(settings, service, python_runs)
    class WorkspaceHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(settings.web_root), **kwargs)

        def end_headers(self):
            self.send_header('Cache-Control', 'no-store')
            super().end_headers()

        def allowed(self):
            port = self.server.server_port
            hosts = (f'127.0.0.1:{port}', f'localhost:{port}')
            origins = (None, f'http://127.0.0.1:{port}', f'http://localhost:{port}')
            return self.headers.get('Host') in hosts and self.headers.get('Origin') in origins

        def reply(self, body, status=200):
            payload = json.dumps(body).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def agent_proxy(self, method):
            # Fixed loopback destination and an explicit protocol subset. Native
            # Harness owns credentials; no arbitrary URL forwarding or Python execution.
            general = {'GET': {'/v1/health', '/v1/backends', '/v1/sessions', '/v1/providers'},
                       'POST': {'/v1/sessions', '/v1/providers', '/v1/providers/discover'}}
            catalog_match = re.fullmatch(r'/v1/catalog/([a-zA-Z0-9._:%-]+)/([a-zA-Z0-9._:%-]+)/rename', self.path)
            match = re.fullmatch(r'/v1/sessions/([a-zA-Z0-9-]+)(?:/(events|messages|cancel|compact|compaction-policy|models|model|subagents(?:/[a-zA-Z0-9._:%-]+/history(?:\?before=[0-9]{1,16})?)?|permissions/[a-zA-Z0-9._:%-]+|questions/[a-zA-Z0-9._:%-]+(?:/cancel)?))?', self.path)
            suffix = match.group(2) if match else None
            valid_session = match and ((method == 'GET' and (suffix in (None, 'events', 'models', 'compaction-policy', 'subagents') or (suffix and suffix.startswith('subagents/')))) or
                (method == 'POST' and suffix and (suffix in ('messages', 'cancel', 'model', 'compact', 'compaction-policy') or suffix.startswith(('permissions/', 'questions/')))))
            if self.path not in general.get(method, set()) and not valid_session and not (method == 'POST' and catalog_match):
                return self.reply({'error': {'code': 'route_not_found', 'message': 'Agent route is not exposed by this workspace.'}}, 404)
            cwd = str(Path(settings.agent_cwd or settings.web_root.parent).resolve())
            body = None
            if method == 'POST':
                if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                    return self.reply({'error': {'code': 'invalid_content_type', 'message': 'Use application/json.'}}, 415)
                try:
                    length = int(self.headers.get('Content-Length', '0'))
                    if not 0 < length <= 1024 * 1024:
                        raise ValueError('Agent request must be between 1 byte and 1 MiB.')
                    body = self.rfile.read(length)
                    data = json.loads(body)
                    if not isinstance(data, dict):
                        raise ValueError('Use a JSON object.')
                    if self.path == '/v1/sessions' and data.get('cwd') != cwd:
                        raise ValueError('Agent sessions must use this workspace directory.')
                except (ValueError, TypeError) as error:
                    return self.reply({'error': {'code': 'invalid_request', 'message': str(error)}}, 400)
            connection = HTTPConnection('127.0.0.1', settings.harness_port, timeout=300 if suffix == 'compact' else 40 if suffix == 'events' else 15)
            try:
                if catalog_match:
                    connection.request('GET', '/v1/sessions')
                    check = connection.getresponse()
                    payload = json.loads(check.read(2 * 1024 * 1024))
                    if check.status != 200: return self.reply(payload, check.status)
                    item = next((item for item in payload.get('sessions', []) if item.get('backendId') == unquote(catalog_match.group(1)) and item.get('sessionId') == unquote(catalog_match.group(2)) and item.get('cwd') == cwd), None)
                    if not item: return self.reply({'error': {'code': 'workspace_mismatch', 'message': 'Session not found in this workspace.'}}, 403)
                if match:
                    connection.request('GET', '/v1/sessions/' + match.group(1))
                    check = connection.getresponse()
                    raw = check.read()
                    if check.status != 200:
                        return self.reply(json.loads(raw), check.status)
                    if json.loads(raw).get('session', {}).get('cwd') != cwd:
                        return self.reply({'error': {'code': 'workspace_mismatch', 'message': 'This session belongs to another workspace.'}}, 403)
                headers = {'Content-Type': 'application/json'}
                cursor = self.headers.get('Last-Event-ID')
                if cursor is not None:
                    if not cursor.isdigit() or len(cursor) > 16:
                        return self.reply({'error': {'code': 'invalid_cursor', 'message': 'Invalid event cursor.'}}, 400)
                    headers['Last-Event-ID'] = cursor
                connection.request(method, self.path, body=body, headers=headers)
                upstream = connection.getresponse()
                if suffix == 'events' and upstream.status == 200:
                    if not upstream.getheader('Content-Type', '').startswith('text/event-stream'):
                        raise ValueError('Agent returned an invalid event stream.')
                    self._agent_stream_started = True
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
                    self.send_header('X-Accel-Buffering', 'no')
                    self.send_header('Connection', 'close')
                    self.end_headers()
                    while True:
                        chunk = upstream.read1(16384)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        self.wfile.flush()
                    return
                raw = upstream.read(2 * 1024 * 1024 + 1)
                if len(raw) > 2 * 1024 * 1024:
                    raise ValueError('Agent response is too large.')
                payload = json.loads(raw)
                if self.path == '/v1/sessions' and method == 'GET' and upstream.status == 200:
                    payload['sessions'] = [item for item in payload.get('sessions', []) if item.get('cwd') == cwd]
                return self.reply(payload, upstream.status)
            except (BrokenPipeError, ConnectionResetError):
                return
            except (OSError, ValueError, socket.timeout, HTTPException):
                if suffix != 'events' or not getattr(self, '_agent_stream_started', False):
                    return self.reply({'error': {'code': 'harness_unavailable', 'message': 'Cannot reach FlagQAI. Start flagqai serve on the configured loopback port.'}}, 503)
            finally:
                connection.close()

        def history_preferences(self, mutation=False):
            root = Path(settings.agent_cwd or settings.web_root.parent).resolve()
            try:
                if not mutation: return self.reply({'trash': history_trash(root)})
                if self.headers.get('Content-Type', '').split(';')[0] != 'application/json': return self.reply({'error': 'Use application/json.'}, 415)
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 4096: raise ValueError('Invalid request size.')
                data = json.loads(self.rfile.read(size))
                if not isinstance(data, dict) or set(data) != {'backendId', 'sessionId', 'trashed'} or type(data['trashed']) is not bool or any(not isinstance(data[key], str) or not re.fullmatch(r'[a-zA-Z0-9._:-]{1,200}', data[key]) for key in ('backendId', 'sessionId')): raise ValueError('Invalid history preference.')
                connection = HTTPConnection('127.0.0.1', settings.harness_port, timeout=15)
                try:
                    connection.request('GET', '/v1/sessions'); response = connection.getresponse(); payload = json.loads(response.read(2 * 1024 * 1024))
                    if response.status != 200: return self.reply({'error': 'Cannot verify native session history.'}, 503)
                    item = next((item for item in payload.get('sessions', []) if item.get('backendId') == data['backendId'] and item.get('sessionId') == data['sessionId'] and item.get('cwd') == str(root)), None)
                    if not item: return self.reply({'error': 'Session not found in this workspace.'}, 403)
                    if data['trashed'] and item.get('availability') == 'occupied': return self.reply({'error': 'This session is in use by another client.'}, 409)
                    if data['trashed'] and item.get('resourceId'):
                        connection.request('GET', '/v1/sessions/' + item['resourceId']); response = connection.getresponse(); current = json.loads(response.read(2 * 1024 * 1024))
                        if response.status != 200 or current.get('session', {}).get('status') != 'idle': return self.reply({'error': 'Finish the running session before moving it to Trash.'}, 409)
                finally: connection.close()
                return self.reply({'trash': history_trash(root, data['backendId'], data['sessionId'], data['trashed'])})
            except (ValueError, TypeError): return self.reply({'error': 'Cannot update history preferences. Native conversations are unchanged.'}, 400)
            except (OSError, HTTPException): return self.reply({'error': 'History preferences are unavailable. Native conversations are unchanged.'}, 503)

        def do_GET(self):
            if not self.allowed():
                return self.reply({'error': 'Only local same-origin access is allowed.'}, 403)
            if self.path.startswith('/api/workspace/events?'):
                try:
                    query = parse_qs(urlsplit(self.path).query)
                    after = int(query.get('after', ['0'])[0])
                    if after < 0: raise ValueError('Invalid cursor.')
                    return self.reply(bridge.events(query.get('client', [''])[0], query.get('session', [''])[0], after))
                except (ValueError, TypeError) as error: return self.reply({'error': str(error)}, 400)
            if self.path == '/api/experiments':
                return self.reply(experiments.records())
            record_match = re.fullmatch(r'/api/experiments/(fqx-[a-f0-9]{32})', self.path)
            if record_match:
                record = experiments.get(record_match.group(1))
                return self.reply(record or {'error': 'Experiment not found.'}, 200 if record else 404)
            match = re.fullmatch(r'/api/experiments/(fqx-[a-f0-9]{32})/file', self.path)
            if match:
                try:
                    content = experiments.file(match.group(1)).read_bytes()
                except FileNotFoundError:
                    return self.reply({'error': 'Experiment not found.'}, 404)
                self.send_response(200)
                self.send_header('Content-Type', 'application/vnd.flagquantum.experiment+zip')
                self.send_header('Content-Disposition', 'attachment; filename="experiment.fqx"')
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
            task_file = re.fullmatch(r'/api/python/runs/([a-f0-9-]{36})/files/([a-f0-9]{64})', self.path)
            if task_file:
                try:
                    content = python_runs.collection_file(task_file.group(1), task_file.group(2)).read_bytes()
                except FileNotFoundError:
                    return self.reply({'error': 'Saved task file not found.'}, 404)
                self.send_response(200)
                self.send_header('Content-Type', 'application/octet-stream')
                self.send_header('Content-Disposition', 'attachment; filename="saved-output.fqx"')
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
            if self.path == '/api/python/environment': return self.reply(python_runs.environment())
            if self.path == '/api/python/runs': return self.reply([{key:run.get(key) for key in ('id','name','status','created_at','environment')} for run in python_runs.store.list()])
            if self.path.startswith('/api/python/runs/'):
                run = python_runs.get(self.path.split('/')[-1])
                return self.reply(run or {'error':'Python task not found.'}, 200 if run else 404)
            if self.path == '/api/agent/history-trash':
                return self.history_preferences()
            if self.path.startswith('/api/editor/files/'):
                try:
                    return self.reply(read_model(Path(settings.agent_cwd or settings.web_root.parent).resolve(), self.path[len('/api/editor/files/'):]))
                except FileNotFoundError:
                    return self.reply({'error': 'Shared model was removed. Your browser draft is retained.'}, 404)
                except (OSError, ValueError, UnicodeError):
                    return self.reply({'error': 'Cannot read shared model. Only regular UTF-8 .qasm or .py files up to 32 KiB are supported.'}, 400)
            if self.path == '/api/agent':
                return self.reply({'cwd': str(Path(settings.agent_cwd or settings.web_root.parent).resolve())})
            if self.path.startswith('/v1/'):
                return self.agent_proxy('GET')
            if self.path == '/api/health':
                return self.reply(service.health())
            if self.path == '/api/jobs':
                return self.reply(service.list_jobs() + [record['job'] for record in experiments.records() if record.get('job')])
            if self.path.startswith('/api/jobs/'):
                identity = self.path.split('/')[-1]
                job = service.get_job(identity) or (experiments.get(identity) or {}).get('job')
                return self.reply(job or {'error': 'Job not found.'}, 200 if job else 404)
            if self.path.startswith('/api/'):
                return self.reply({'error': 'Not found.'}, 404)
            return super().do_GET()

        def do_POST(self):
            if not self.allowed():
                return self.reply({'error': 'Only local same-origin access is allowed.'}, 403)
            if urlsplit(self.path).path == '/api/experiments':
                if self.headers.get('Content-Type', '').split(';')[0] != 'application/octet-stream':
                    return self.reply({'error': 'Use application/octet-stream for .fqx files.'}, 415)
                try:
                    length = int(self.headers.get('Content-Length', '0'))
                    if not 0 < length <= MAX_UPLOAD_BYTES:
                        raise ValueError('Upload an .fqx experiment no larger than 16 MiB.')
                    filename = parse_qs(urlsplit(self.path).query).get('name', ['experiment.fqx'])[0]
                    return self.reply(experiments.import_file(self.rfile.read(length), filename), 201)
                except (ValueError, TypeError) as error:
                    return self.reply({'error': str(error)}, 400)
                except OSError:
                    return self.reply({'error': 'Cannot store experiment. Check the local SDK runtime and disk access.'}, 503)
            if self.path in ('/api/python/check', '/api/python/runs') or re.fullmatch(r'/api/python/runs/[a-zA-Z0-9-]+/cancel', self.path):
                try:
                    length = int(self.headers.get('Content-Length', '0'))
                    if self.headers.get('Content-Type','').split(';')[0] != 'application/json' or not 0 < length <= 256*1024: raise ValueError('Use a bounded JSON request.')
                    data = json.loads(self.rfile.read(length))
                    if self.path == '/api/python/check': return self.reply({'diagnostic':python_runs.validate(data.get('source'))})
                    if self.path.endswith('/cancel'): return self.reply(python_runs.cancel(self.path.split('/')[-2]))
                    return self.reply(python_runs.submit(data), 202)
                except (ValueError, TypeError, AttributeError) as error: return self.reply({'error':str(error)}, 400)
            if self.path in ('/api/workspace/context', '/api/workspace/actions'):
                try:
                    if self.headers.get('Content-Type', '').split(';')[0] != 'application/json': raise ValueError('Use application/json.')
                    length = int(self.headers.get('Content-Length', '0'))
                    if not 0 < length <= 256 * 1024: raise ValueError('Invalid action size.')
                    data = json.loads(self.rfile.read(length))
                    if not isinstance(data, dict): raise ValueError('Use an object.')
                    return self.reply(bridge.publish(data) if self.path.endswith('/context') else bridge.act(data))
                except BridgeConflict as error: return self.reply({'error': str(error)}, 409)
                except (ValueError, TypeError, AttributeError) as error: return self.reply({'error': str(error)}, 400)
                except QueueFullError as error: return self.reply({'error': str(error)}, 429)
                except Exception as error: return self.reply({'error': str(error)}, 502)
            if self.path == '/api/agent/history-trash':
                return self.history_preferences(True)
            if self.path.startswith('/v1/'):
                return self.agent_proxy('POST')
            if self.path == '/api/editor/files':
                if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                    return self.reply({'error': 'Use application/json.'}, 415)
                try:
                    length = int(self.headers.get('Content-Length', '0'))
                    if not 0 < length <= 256 * 1024:
                        raise ValueError('Invalid request size.')
                    data = json.loads(self.rfile.read(length))
                    return self.reply(create_model(Path(settings.agent_cwd or settings.web_root.parent).resolve(), data.get('source'), data.get('language','qasm')), 201)
                except (OSError, ValueError, TypeError, AttributeError):
                    return self.reply({'error': 'Cannot share model. Use UTF-8 source up to 32 KiB in this workspace.'}, 400)
            if self.path not in ('/api/compile', '/api/jobs'):
                return self.reply({'error': 'Not found.'}, 404)
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                return self.reply({'error': 'Use application/json.'}, 415)
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= LIMITS['request_bytes']:
                    raise ValueError('Invalid request size.')
                data = json.loads(self.rfile.read(length))
                if self.path == '/api/compile':
                    return self.reply(service.compile(data))
                return self.reply(service.submit(data), 202)
            except (ValueError, TypeError, AttributeError) as error:
                self.reply({'error': str(error)}, 400)
            except QueueFullError as error:
                self.reply({'error': str(error)}, 429)
            except Exception as error:
                self.reply({'error': str(error)}, 502)

    server = ThreadingHTTPServer(('127.0.0.1', settings.port), WorkspaceHandler)
    original_close = server.server_close
    def close():
        python_runs.close()
        original_close()
    server.server_close = close
    return server
