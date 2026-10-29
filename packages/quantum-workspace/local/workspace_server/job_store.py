"""SQLite persistence compatible with the existing local job database."""
import json
from pathlib import Path
from contextlib import closing
import sqlite3
import threading


class SQLiteJobStore:
    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.lock, closing(sqlite3.connect(self.path)) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
            for jid, payload in db.execute('SELECT id,payload FROM jobs').fetchall():
                job = json.loads(payload)
                if job['status'] in ('queued', 'running'):
                    job.update(status='failed', error='Local server restarted before this job completed. Submit again.')
                    db.execute('UPDATE jobs SET payload=? WHERE id=?', (json.dumps(job), jid))

    def put(self, job):
        with self.lock, closing(sqlite3.connect(self.path)) as db, db:
            db.execute('INSERT OR REPLACE INTO jobs VALUES (?,?)', (job['id'], json.dumps(job)))

    def list(self):
        with self.lock, closing(sqlite3.connect(self.path)) as db, db:
            rows = db.execute('SELECT payload FROM jobs ORDER BY rowid DESC LIMIT 100')
            return [json.loads(row[0]) for row in rows]

    def get(self, job_id):
        with self.lock, closing(sqlite3.connect(self.path)) as db, db:
            row = db.execute('SELECT payload FROM jobs WHERE id=?', (job_id,)).fetchone()
            return json.loads(row[0]) if row else None
