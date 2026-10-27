import { logForDebugging } from "../../utils/debug.js";
import { logError } from "../../utils/log.js";

type ReadableInputHost = {
	stdin: NodeJS.ReadStream;
	lastActivityAt: number;
	consume: (chunk: string | Buffer) => void;
	onReadable: () => void;
	hasRawModeLease: () => boolean;
	onResume?: () => void;
};

const RESUME_GAP_MS = 5000;

/** Drain one readable notification without leaking a second stdin listener. */
export function drainReadableInput(host: ReadableInputHost): number {
	const now = Date.now();
	try {
		for (let chunk = host.stdin.read(); chunk !== null; chunk = host.stdin.read()) {
			host.consume(chunk);
		}
	} catch (error) {
		logError(error);
		if (host.hasRawModeLease() && !host.stdin.listeners("readable").includes(host.onReadable)) {
			host.stdin.addListener("readable", host.onReadable);
		}
	}

	if (now - host.lastActivityAt > RESUME_GAP_MS) {
		logForDebugging("stdin resumed after inactivity", { gapMs: now - host.lastActivityAt });
		host.onResume?.();
	}
	return now;
}
