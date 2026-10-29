"""Application operations shared by HTTP and a future authorized tool adapter."""
from concurrent.futures import ThreadPoolExecutor
import threading
import time
import uuid

from quantum_workspace_protocol import CircuitRequest, LIMITS, PROTOCOL_VERSION, JobStatus, source_hash


class QueueFullError(RuntimeError):
    pass


class QuantumWorkspaceService:
    def __init__(self, store, adapter):
        self.store = store
        self.adapter = adapter
        self.pool = ThreadPoolExecutor(max_workers=1)
        self.slots = threading.BoundedSemaphore(4)

    def health(self):
        return {
            'mode': 'real', 'backend': 'flagquantum_pytorch_cpu', 'transport': getattr(self.adapter, 'transport', 'SSH') if isinstance(getattr(self.adapter, 'transport', 'SSH'), str) else 'SSH',
            'max_qubits': LIMITS['qubits'], 'max_shots': LIMITS['shots'],
            'protocol_version': PROTOCOL_VERSION,
            'note': 'Connection checked when compiling or running.',
        }

    def compile(self, data):
        request = CircuitRequest.parse(data)
        self._acquire()
        try:
            result = self.pool.submit(self.adapter.execute, {**request.to_dict(), 'operation': 'compile'}).result(timeout=440)
            return {**result, 'transport': self.health()['transport'], 'protocol_version': PROTOCOL_VERSION, 'source_hash': source_hash(request.source)}
        finally:
            self.slots.release()

    def submit(self, data):
        request = CircuitRequest.parse(data)
        self._acquire()
        job = {
            'id': str(uuid.uuid4()), 'name': str(data.get('name') or 'Quantum program')[:100],
            'status': JobStatus.QUEUED.value, 'created_at': time.time(),
            'request': request.to_dict(), 'source_hash': source_hash(request.source),
            'protocol_version': PROTOCOL_VERSION,
        }
        try:
            self.store.put(job)
            self.pool.submit(self._execute, dict(job))
        except Exception as error:
            job.update(status=JobStatus.FAILED.value, error=str(error), finished_at=time.time())
            try:
                self.store.put(job)
            finally:
                self.slots.release()
            raise
        return job

    def _acquire(self):
        if not self.slots.acquire(blocking=False):
            raise QueueFullError('Queue full; try again after a job completes.')

    def _execute(self, job):
        try:
            job.update(status=JobStatus.RUNNING.value)
            self.store.put(job)
            result = self.adapter.execute({**job['request'], 'operation': 'run'})
            result['transport'] = self.health()['transport']
            job.update(status=JobStatus.COMPLETED.value, result=result, finished_at=time.time())
        except Exception as error:
            job.update(status=JobStatus.FAILED.value, error=str(error), finished_at=time.time())
        finally:
            try:
                self.store.put(job)
            finally:
                self.slots.release()

    def list_jobs(self):
        return self.store.list()

    def get_job(self, job_id):
        return self.store.get(job_id)

    def close(self):
        self.pool.shutdown(wait=True)
