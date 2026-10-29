# Native automatic compaction policy

The pinned `dsh-compaction-basic` patch adds per-Agent `readAutoPolicy` and
`setAutoPolicy`. It retains the original pressure, overflow and summary machinery;
no Web timer or alternate compaction loop is introduced. Automatic hooks are
mounted once and consult the Agent's immutable resolved policy on each call.
Turning one Agent off leaves manual compaction and other Agents unaffected.
Threshold changes use upstream validation and preserve retention/headroom rules.

Install this workspace with its pnpm lockfile/patch before building the native
host. A stock peer installation without the patch does not expose live settings;
the adapter and Web report that capability as unavailable. Distribution of a
standalone native host must carry this patch or an upstream equivalent. Do not
claim support based only on a saved browser preference.

Session preference persistence belongs to the native adapter, under the session
workspace's `.flagqai/compaction-policies`, and contains no credentials or messages.
