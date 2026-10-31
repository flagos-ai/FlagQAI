"""Native-tool command adapter for the local Web workbench; no Agent runtime.
Use via an existing Harness shell tool. All compute goes through the UI service.
"""
import argparse
import json
import sys
import uuid
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4188)
    parser.add_argument('--client', required=True)
    parser.add_argument('--session', required=True)
    parser.add_argument('--request-id', default=None)
    parser.add_argument('operation', choices=['status', 'draft.read', 'model.read', 'model.create', 'model.share', 'compile', 'run', 'job.read', 'focus', 'python.run', 'python.read', 'python.cancel', 'experiment.read', 'project.inspect', 'project.run'])
    parser.add_argument('--source-file')
    parser.add_argument('--model-id')
    parser.add_argument('--project-id')
    parser.add_argument('--entry')
    parser.add_argument('--language', choices=['qasm','python'])
    parser.add_argument('--run-id')
    parser.add_argument('--experiment-id')
    parser.add_argument('--revision')
    parser.add_argument('--expected-hash')
    parser.add_argument('--program-id')
    parser.add_argument('--job-id')
    parser.add_argument('--page')
    parser.add_argument('--shots', type=int, default=1024)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--name')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535: parser.error('Invalid local port.')
    data = {key: value for key, value in vars(args).items() if value is not None and key not in ('port', 'source_file', 'revision')}
    data['request_id'] = args.request_id or str(uuid.uuid4())
    if args.revision: data['expected_revision'] = args.revision
    if args.source_file:
        root = Path(__file__).resolve().parents[2]
        path = (Path.cwd()/args.source_file).resolve()
        if root not in path.parents or not path.is_file() or path.stat().st_size > 32768:
            parser.error('Use a regular source file within this workspace, at most 32 KiB.')
        data['source'] = path.read_text(encoding='utf-8')
    request = Request('http://127.0.0.1:%d/api/workspace/actions' % args.port, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
    try:
        with urlopen(request, timeout=450) as response: result = json.load(response)
        print(json.dumps({'request_id': data['request_id'], 'result': result}, ensure_ascii=False))
    except HTTPError as error:
        print(json.dumps({'request_id': data['request_id'], 'error': json.load(error)}, ensure_ascii=False))
        return 1
    except Exception as error:
        print(json.dumps({'request_id': data['request_id'], 'error': str(error)}))
        return 1
    return 0


if __name__ == '__main__': sys.exit(main())
