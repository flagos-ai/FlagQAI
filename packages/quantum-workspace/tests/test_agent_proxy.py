"""Agent transport tests; no model calls or live credentials."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'local'))
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.client import HTTPConnection
import json
import tempfile
import threading
import unittest
from unittest.mock import Mock
from workspace_server.config import WorkspaceSettings
from workspace_server.http import create_server

class AgentProxyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.cwd = str(Path(self.temp.name).resolve())
        self.calls = []
        self.release = threading.Event()
        outer = self
        class Upstream(BaseHTTPRequestHandler):
            def do_GET(self):
                outer.calls.append((self.command, self.path, self.headers.get('Last-Event-ID')))
                if self.path == '/v1/sessions/local/events':
                    self.send_response(200); self.send_header('Content-Type','text/event-stream'); self.end_headers()
                    self.wfile.write(b': heartbeat\n\n'); self.wfile.flush()
                    outer.release.wait(3)
                    return
                data = {'sessions':[{'cwd':outer.cwd,'sessionId':'ok','backendId':'dsh','availability':'available'},{'cwd':'/other','sessionId':'hidden','backendId':'dsh','availability':'available'}]} if self.path == '/v1/sessions' else {'session':{'cwd':'/other' if self.path.endswith('/foreign') else outer.cwd}}
                raw=json.dumps(data).encode()
                self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)
            def do_POST(self):
                body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                outer.calls.append((self.command,self.path,body))
                raw=json.dumps({'receipt':{'accepted':True},'session':{'id':'local','cwd':outer.cwd}}).encode()
                self.send_response(201 if self.path == '/v1/sessions' else 202); self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)
            def log_message(self,*args): pass
        self.upstream=ThreadingHTTPServer(('127.0.0.1',0),Upstream)
        threading.Thread(target=self.upstream.serve_forever,daemon=True).start()
        settings=WorkspaceSettings(Path(self.temp.name),Path(self.temp.name)/'jobs',port=0,harness_port=self.upstream.server_port,agent_cwd=Path(self.cwd))
        self.server=create_server(settings,Mock())
        threading.Thread(target=self.server.serve_forever,daemon=True).start()
    def tearDown(self):
        self.release.set()
        self.server.shutdown(); self.server.server_close(); self.upstream.shutdown();self.upstream.server_close();self.temp.cleanup()
    def request(self,path,body=None,origin=None):
        conn=HTTPConnection('127.0.0.1',self.server.server_port,timeout=2)
        headers={'Content-Type':'application/json'}
        if origin: headers['Origin']=origin
        conn.request('POST' if body is not None else 'GET',path,None if body is None else json.dumps(body),headers)
        response=conn.getresponse();data=response.read();conn.close();return response.status,json.loads(data)
    def test_cwd_is_fixed_and_catalog_filtered(self):
        self.assertEqual(self.request('/api/agent')[1]['cwd'],self.cwd)
        self.assertEqual(len(self.request('/v1/sessions')[1]['sessions']),1)
        self.assertEqual(self.request('/v1/sessions',{'backendId':'dsh','cwd':'/other'})[0],400)
        self.assertEqual(self.request('/v1/sessions',{'backendId':'dsh','cwd':self.cwd})[0],201)
    def test_foreign_origin_routes_and_sessions_are_refused(self):
        self.assertEqual(self.request('/v1/health',origin='https://evil.example')[0],403)
        self.assertEqual(self.request('/v1/providers/delete',{})[0],404)
        self.assertEqual(self.request('/v1/sessions/local/context/files')[0],404)
        self.assertEqual(self.request('/v1/sessions/foreign/messages',{'text':'no'})[0],403)
        self.assertFalse(any(call[0]=='POST' for call in self.calls))
    def test_messages_forward_to_fixed_native_session(self):
        body={'clientMessageId':'same-id','text':'test','placement':'turn'}
        self.assertEqual(self.request('/v1/sessions/local/messages',body)[0],202)
        self.assertEqual(self.calls[-1],('POST','/v1/sessions/local/messages',body))
    def test_sse_flushes_before_upstream_finishes_and_forwards_cursor(self):
        conn=HTTPConnection('127.0.0.1',self.server.server_port,timeout=1)
        conn.request('GET','/v1/sessions/local/events',headers={'Last-Event-ID':'7'})
        response=conn.getresponse()
        self.assertEqual(response.status,200)
        self.assertEqual(response.read(13),b': heartbeat\n\n')
        self.assertFalse(self.release.is_set())
        self.assertEqual(self.calls[-1],('GET','/v1/sessions/local/events','7'))
        self.release.set(); response.read(); conn.close()

    def test_model_and_provider_routes_forward_but_keep_origin_and_cwd_guards(self):
        self.assertEqual(self.request('/v1/providers')[0],200)
        for path, body in [('/v1/providers/discover',{'kind':'custom','route':'test','apiKey':'test-only-key'}),('/v1/providers',{'kind':'custom','route':'test','models':['test-model']}),('/v1/sessions/local/model',{'provider':'test','model':'test-model'})]:
            code, result = self.request(path,body)
            self.assertEqual(code,202)
            self.assertNotIn('test-only-key',json.dumps(result))
            self.assertEqual(self.calls[-1],('POST',path,body))
        self.assertEqual(self.request('/v1/sessions/local/models')[0],200)
        self.assertEqual(self.request('/v1/sessions/foreign/model',{'model':'test'})[0],403)
        self.assertEqual(self.request('/v1/providers',{'route':'blocked'},'https://other.example')[0],403)

    def test_history_rename_and_reversible_trash_are_workspace_scoped(self):
        status, _ = self.request('/v1/catalog/dsh/ok/rename', {'title':'New name'})
        self.assertEqual(status,202)
        self.assertEqual(self.request('/v1/catalog/dsh/hidden/rename', {'title':'Wrong workspace'})[0],403)
        ref = {'backendId':'dsh','sessionId':'ok','trashed':True}
        self.assertEqual(self.request('/api/agent/history-trash',ref)[1]['trash'],[{'backendId':'dsh','sessionId':'ok'}])
        self.assertEqual(len(self.request('/api/agent/history-trash')[1]['trash']),1)
        self.assertEqual(self.request('/api/agent/history-trash',{**ref,'trashed':False})[1]['trash'],[])
        self.assertEqual(self.request('/api/agent/history-trash',{**ref,'sessionId':'hidden'})[0],403)
        self.assertEqual(self.request('/api/agent/history-trash',ref,'https://other.example')[0],403)

    def test_native_compaction_is_post_only_and_workspace_scoped(self):
        self.assertEqual(self.request('/v1/sessions/local/compact', {})[0], 202)
        self.assertEqual(self.calls[-1], ('POST', '/v1/sessions/local/compact', {}))
        self.assertEqual(self.request('/v1/sessions/local/compact')[0], 404)
        self.assertEqual(self.request('/v1/sessions/foreign/compact', {})[0], 403)
        self.assertEqual(self.request('/v1/sessions/local/compact', {}, 'https://other.example')[0], 403)
        self.assertEqual(sum(call[0] == 'POST' for call in self.calls), 1)

    def test_compaction_policy_is_a_scoped_native_route(self):
        self.assertEqual(self.request('/v1/sessions/local/compaction-policy')[0], 200)
        body = {'enabled': False, 'thresholdRatio': .85}
        self.assertEqual(self.request('/v1/sessions/local/compaction-policy', body)[0], 202)
        self.assertEqual(self.calls[-1], ('POST', '/v1/sessions/local/compaction-policy', body))
        self.assertEqual(self.request('/v1/sessions/foreign/compaction-policy', body)[0], 403)
        self.assertEqual(self.request('/v1/sessions/local/compaction-policy', body, 'https://other.example')[0], 403)

    def test_subagent_catalog_and_read_only_history_preserve_workspace_guards(self):
        for path in ['/v1/sessions/local/subagents', '/v1/sessions/local/subagents/child-1/history', '/v1/sessions/local/subagents/child-1/history?before=12']:
            self.assertEqual(self.request(path)[0], 200)
            self.assertEqual(self.calls[-1][1], path)
        self.assertEqual(self.request('/v1/sessions/foreign/subagents')[0], 403)
        self.assertEqual(self.request('/v1/sessions/foreign/subagents/child-1/history')[0], 403)
        self.assertEqual(self.request('/v1/sessions/local/subagents/child-1/history', {})[0], 404)
        self.assertEqual(self.request('/v1/sessions/local/subagents/child-1/history?before=-1')[0], 404)
        self.assertEqual(self.request('/v1/sessions/local/subagents/child-1/history?before=1&url=evil')[0], 404)
        self.assertEqual(self.request('/v1/sessions/local/subagents/child-1/history', origin='https://evil.example')[0], 403)
