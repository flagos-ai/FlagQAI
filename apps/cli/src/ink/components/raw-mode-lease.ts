import { stopCapturingEarlyInput } from "../../utils/earlyInput.js";
import { supportsExtendedKeys, supportsWin32InputMode } from "../terminal.js";
import {
	DISABLE_KITTY_KEYBOARD,
	DISABLE_MODIFY_OTHER_KEYS,
	DISABLE_WIN32_INPUT_MODE,
	ENABLE_KITTY_KEYBOARD,
	ENABLE_MODIFY_OTHER_KEYS,
	ENABLE_WIN32_INPUT_MODE,
} from "../termio/csi.js";
import { DBP, DFE, EBP, EFE } from "../termio/dec.js";

type RawModeLease = {
	stdin: NodeJS.ReadStream;
	stdout: NodeJS.WriteStream;
	requests: number;
	onReadable: () => void;
	onFirstEnable: () => void;
};

/** Manage terminal ownership while multiple components request raw input. */
export function changeRawModeLease(lease: RawModeLease, enabled: boolean): number {
	const { stdin, stdout, onReadable } = lease;
	stdin.setEncoding("utf8");

	if (enabled) {
		const requests = lease.requests + 1;
		if (requests > 1) return requests;

		stopCapturingEarlyInput();
		stdin.ref();
		stdin.setRawMode(true);
		stdin.on("readable", onReadable);
		stdout.write(EBP);
		stdout.write(EFE);
		if (supportsExtendedKeys()) {
			stdout.write(ENABLE_KITTY_KEYBOARD);
			stdout.write(ENABLE_MODIFY_OTHER_KEYS);
		}
		if (supportsWin32InputMode()) stdout.write(ENABLE_WIN32_INPUT_MODE);
		lease.onFirstEnable();
		return requests;
	}

	if (lease.requests <= 0) return 0;
	const requests = lease.requests - 1;
	if (requests > 0) return requests;

	stdin.removeListener("readable", onReadable);
	stdout.write(DISABLE_MODIFY_OTHER_KEYS);
	stdout.write(DISABLE_KITTY_KEYBOARD);
	stdout.write(DISABLE_WIN32_INPUT_MODE);
	stdout.write(DFE);
	stdout.write(DBP);
	stdin.setRawMode(false);
	stdin.unref();
	return 0;
}
