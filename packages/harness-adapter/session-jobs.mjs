// SPDX-License-Identifier: MIT
// Derived from dsh-TUI; see session-log/LICENSE and README.md for provenance.
/** A read-through view of the native registry, with an exact session fence. */
export function createNativeJobsCapability(jobs, owner) {
  if (jobs === undefined || jobs.readAt === undefined)
    return undefined;
  const owned = () => jobs.list(owner).filter(job => job.owner === owner);
  return {
    async list() {
      return owned().slice(-40).map(job => {
        const earliest = job.output?.earliest ?? 0;
        const from = Math.max(earliest, (job.output?.total ?? 0) - 16384);
        const read = jobs.readAt(job.id, from, owner);
        const text = read.chunks.map(chunk => (chunk.channel === 'stderr' ? '[stderr] ' : '') + chunk.text).join('');
        const lines = text.split('\n');
        const output = lines.slice(-200).join('\n').slice(-16384);
        return {
          id: job.id, kind: job.kind, label: job.label.slice(0, 2048), status: job.status,
          startedAt: job.startedAt,
          ...(job.finishedAt === undefined ? {} : { finishedAt: job.finishedAt }),
          ...(job.detail === undefined ? {} : { detail: job.detail.slice(0, 2048) }),
          ...(job.progress === undefined ? {} : { progress: job.progress.slice(0, 2048) }),
          output, truncated: from > 0 || read.lossy === true || read.chunks.some(chunk => chunk.gapBefore) || lines.length > 200 || text.length > 16384,
        };
      });
    },
    async stop(id) {
      if (!owned().some(job => job.id === id))
        throw new Error('Job is not owned by this session');
      await jobs.kill(id, owner, 'Stopped from FlagQAI');
    },
  };
}
