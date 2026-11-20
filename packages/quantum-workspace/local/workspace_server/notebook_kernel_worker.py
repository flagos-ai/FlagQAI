"""JSON-lines bridge to a real IPython kernel in the selected interpreter."""
import json
import queue
import sys
import threading
import time

write_lock = threading.Lock()

def emit(value):
    with write_lock:
        print(json.dumps(value), flush=True)

try:
    from jupyter_client import KernelManager
    manager = KernelManager(kernel_name='python3')
    # Always use the selected interpreter, not a host's unrelated kernelspec.
    manager.kernel_spec.argv = [sys.executable, '-m', 'ipykernel_launcher', '-f', '{connection_file}']
    manager.start_kernel(stdout=sys.stderr, stderr=sys.stderr)
    client = manager.client()
    client.start_channels()
    client.wait_for_ready(timeout=25)
    emit({'type': 'ready', 'python': sys.version.split()[0], 'executable': sys.executable})
except Exception as error:
    if 'manager' in globals():
        try:
            manager.shutdown_kernel(now=True)
        except Exception:
            pass
    emit({'type': 'fatal', 'error': 'Cannot start IPython kernel: ' + str(error)[:500]
          + '. Install jupyter-client and ipykernel in the selected Python environment.'})
    sys.exit(1)

busy = threading.Lock()

def execute(request):
    try:
        for cell in request['cells']:
            count = None
            failed = False
            emitted = 0
            output_count = 0
            truncated = False
            emit({'type': 'cell_start', 'cell_id': cell['id']})
            message = client.execute(cell['source'], allow_stdin=False, stop_on_error=True)
            deadline = time.monotonic() + 90
            while True:
                if time.monotonic() >= deadline:
                    manager.interrupt_kernel()
                    raise TimeoutError('Cell exceeded the 90-second limit; restart the kernel before continuing.')
                try:
                    event = client.get_iopub_msg(timeout=0.2)
                except queue.Empty:
                    if not manager.is_alive():
                        raise RuntimeError('Kernel exited during execution; variables were lost.')
                    continue
                if event.get('parent_header', {}).get('msg_id') != message:
                    continue
                kind = event['header']['msg_type']
                content = event['content']
                if kind == 'status' and content['execution_state'] == 'idle':
                    break
                if kind == 'execute_input':
                    count = content.get('execution_count')
                if kind == 'error':
                    failed = True
                if kind not in ('stream', 'error', 'execute_result', 'display_data', 'clear_output'):
                    continue
                if kind in ('execute_result', 'display_data'):
                    # Never forward active HTML/JS/SVG into the workbench.
                    content = {'data': {key: value for key, value in content.get('data', {}).items()
                               if key in ('text/plain', 'image/png', 'image/jpeg', 'application/json')},
                               'execution_count': content.get('execution_count')}
                    if kind == 'display_data':
                        content.pop('execution_count', None)
                elif kind == 'error':
                    content = {key: content.get(key) for key in ('ename', 'evalue', 'traceback')}
                size = len(json.dumps(content).encode())
                if emitted + size > 1024 * 1024 or output_count >= 2000:
                    if not truncated:
                        emit({'type': 'output', 'cell_id': cell['id'], 'output': {'output_type': 'stream',
                              'name': 'stderr', 'text': '\nOutput truncated (1 MiB or 2000 events).\n'}})
                        truncated = True
                    continue
                emitted += size
                output_count += 1
                emit({'type': 'output', 'cell_id': cell['id'], 'output': {'output_type': kind, **content}})
            emit({'type': 'cell_done', 'cell_id': cell['id'], 'execution_count': count,
                  'status': 'failed' if failed else 'completed'})
            if failed:
                break
        emit({'type': 'done'})
    except Exception as error:
        emit({'type': 'fatal', 'error': str(error)[:1000]})
    finally:
        busy.release()

try:
    for line in sys.stdin:
        request = json.loads(line)
        if request['action'] == 'execute':
            if busy.acquire(blocking=False):
                threading.Thread(target=execute, args=(request,), daemon=True).start()
        elif request['action'] == 'interrupt':
            manager.interrupt_kernel()
        elif request['action'] == 'shutdown':
            break
finally:
    manager.shutdown_kernel(now=True)
    client.stop_channels()
