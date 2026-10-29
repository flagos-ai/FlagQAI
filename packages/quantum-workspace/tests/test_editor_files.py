import json
import os
import sys
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'local'))
from workspace_server.editor_files import create_model,read_model
from workspace_server.config import WorkspaceSettings
from workspace_server.http import create_server

class EditorFilesTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
    def tearDown(self): self.temp.cleanup()
    def test_create_read_and_atomic_replacement(self):
        first=create_model(self.root,'OPENQASM 2.0;')
        self.assertEqual(read_model(self.root,first['id']),first)
        path=self.root/first['path'];replacement=path.with_suffix('.tmp');replacement.write_text('h q[0];');replacement.replace(path)
        changed=read_model(self.root,first['id']);self.assertNotEqual(changed['revision'],first['revision']);self.assertEqual(changed['source'],'h q[0];')
        second=create_model(self.root,'another');self.assertNotEqual(second['id'],first['id']);self.assertEqual(path.read_text(),'h q[0];')
    def test_traversal_symlinks_directories_large_non_utf8_are_rejected(self):
        first=create_model(self.root,'original');path=self.root/first['path']
        for name in ('../settings.json','%2e%2e%2fsettings.json','other.py'):
            with self.assertRaises(ValueError):read_model(self.root,name)
        path.unlink();path.symlink_to(self.root/'secret');(self.root/'secret').write_text('secret')
        with self.assertRaises(OSError):read_model(self.root,first['id'])
        path.unlink();path.mkdir()
        with self.assertRaises((ValueError,OSError)):read_model(self.root,first['id'])
        path.rmdir();path.write_bytes(b'\xff')
        with self.assertRaises(UnicodeError):read_model(self.root,first['id'])
        path.write_bytes(b'x'*32769)
        with self.assertRaises(ValueError):read_model(self.root,first['id'])
        with self.assertRaises(ValueError):create_model(self.root,'x'*32769)
    def test_symlink_directory_and_fifo_are_refused(self):
        (self.root/'.flagqai').symlink_to(self.root,target_is_directory=True)
        with self.assertRaises(OSError):create_model(self.root,'no')
        (self.root/'.flagqai').unlink();first=create_model(self.root,'safe');path=self.root/first['path'];path.unlink();os.mkfifo(path)
        with self.assertRaises(ValueError):read_model(self.root,first['id'])
    def test_http_origin_guard_and_bounded_exchange(self):
        server=create_server(WorkspaceSettings(self.root,self.root/'jobs',port=0,agent_cwd=self.root),Mock());threading.Thread(target=server.serve_forever,daemon=True).start()
        def request(method,path,data=None,origin=None):
            conn=HTTPConnection('127.0.0.1',server.server_port,timeout=2);headers={'Content-Type':'application/json'}
            if origin:headers['Origin']=origin
            conn.request(method,path,None if data is None else json.dumps(data),headers);response=conn.getresponse();result=(response.status,json.loads(response.read()));conn.close();return result
        try:
            self.assertEqual(request('POST','/api/editor/files',{'source':'safe'},'https://other.example')[0],403)
            code,file=request('POST','/api/editor/files',{'source':'safe'});self.assertEqual(code,201)
            self.assertEqual(request('GET','/api/editor/files/'+file['id'])[1]['source'],'safe')
            self.assertEqual(request('GET','/api/editor/files/../settings.json')[0],400)
            self.assertEqual(request('POST','/api/editor/files',{'source':'x'*32769})[0],400)
            (self.root/file['path']).unlink();self.assertEqual(request('GET','/api/editor/files/'+file['id'])[0],404)
        finally:server.shutdown();server.server_close()
