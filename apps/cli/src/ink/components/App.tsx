import { drainReadableInput } from "./readable-input-host.js";
import { changeRawModeLease } from "./raw-mode-lease.js";
import { handleMouseEvent } from "./pointer-host.js";
import { dispatchInputBatch } from "./input-batch.js";
import React, { PureComponent, type ReactNode } from "react";
import { logForDebugging } from "../../utils/debug.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { logMouseDebug } from "../../utils/debug.js";
import { logError } from "../../utils/log.js";
import { appendCrashLog, serializeCrashDetail } from "../../utils/crashDetail.js";
import { isNestedUpdateOverflow, noteBoundaryRecoveryRemount, shouldRecoverBoundaryOverflow } from "../update-overflow-guard.js";
import { EventEmitter } from "../events/emitter.js";
import instances from "../instances.js";
import { DragEvent } from "../events/drag-event.js";
import type { DOMElement } from "../dom.js";
import {
	INITIAL_STATE,
	type KeyParseState,
	type ParsedInput,
	type ParsedKey,
	parseMultipleKeypresses,
} from "../parse-keypress.js";
import reconciler from "../reconciler.js";
import {
	finishSelection,
	type SelectionState,
} from "../selection.js";
import {
	isXtermJs,
	setXtversionName,
	supportsWin32InputMode,
} from "../terminal.js";
import {
	getTerminalFocused,
	setTerminalFocused,
} from "../terminal-focus-state.js";
import { TerminalQuerier, xtversion } from "../terminal-querier.js";
import {
	HIDE_CURSOR,
	SHOW_CURSOR,
} from "../termio/dec.js";
import AppContext from "./AppContext.js";
import { ClockProvider } from "./ClockContext.js";
import CursorDeclarationContext, {
	type CursorDeclarationSetter,
} from "./CursorDeclarationContext.js";
import ErrorOverview from "./ErrorOverview.js";
import StdinContext from "./StdinContext.js";
import { TerminalFocusProvider } from "./TerminalFocusContext.js";
import { TerminalSizeContext } from "./TerminalSizeContext.js";
import { TerminalWriteProvider } from "../useTerminalNotification.js";

// After this many milliseconds of stdin silence, the next chunk triggers
// a terminal mode re-assert (mouse tracking). Catches tmux detach→attach,
// ssh reconnect, and laptop wake — the terminal resets DEC private modes
// but no signal reaches us. 5s is well above normal inter-keystroke gaps
// but short enough that the first scroll after reattach works.
const STDIN_RESUME_GAP_MS = 5000;

type Props = {
	readonly children: ReactNode;
	readonly stdin: NodeJS.ReadStream;
	readonly stdout: NodeJS.WriteStream;
	readonly stderr: NodeJS.WriteStream;
	readonly exitOnCtrlC: boolean;
	readonly onExit: (error?: Error) => void;
	readonly terminalColumns: number;
	readonly terminalRows: number;
	// Text selection state. App mutates this directly from mouse events
	// and calls onSelectionChange to trigger a repaint. Mouse events only
	// arrive when <AlternateScreen> (or similar) enables mouse tracking,
	// so the handler is always wired but dormant until tracking is on.
	readonly selection: SelectionState;
	readonly onSelectionChange: () => void;
	// Dispatch a click at (col, row) — hit-tests the DOM tree and bubbles
	// onClick handlers. Returns true if a DOM handler consumed the click.
	// No-op (returns false) outside fullscreen mode (Ink.dispatchClick
	// gates on altScreenActive). The button byte is the raw SGR release
	// code, carrying the modifier bits (shift/alt/ctrl) for ClickEvent.
	// deferProbe: release-path clicks defer the health probe to the batch
	// tail — a single stdin chunk can carry `release → next press`, and the
	// probe must not write before the next press latch is established.
	readonly onClickAt: (col: number, row: number, button?: number, deferProbe?: boolean) => boolean;
	// Dispatch a context-menu event at (col, row) on RIGHT-button press —
	// hit-tests the DOM tree and bubbles onContextMenu handlers, mirroring
	// the DOM contextmenu event that shows on mousedown. Returns true if a
	// DOM handler consumed it. No-op (returns false) outside fullscreen.
	// The button byte is the raw SGR press code (low bits 2 = right button,
	// modifier bits preserved) so handlers can read shift/alt/ctrl.
	readonly onContextMenuAt: (col: number, row: number, button?: number) => boolean;
	// Dispatch hover (onMouseEnter/onMouseLeave) as the pointer moves over
	// DOM elements. Called for mode-1003 motion events with no button held.
	// No-op outside fullscreen (Ink.dispatchHover gates on altScreenActive).
	readonly onHoverAt: (col: number, row: number) => void;
	// Route a wheel event by pointer position: hit-test (col, row) and
	// dispatch onWheel on the deepest scroll container under the cursor.
	// Returns true when an onWheel handler consumed the event — the caller
	// then skips the legacy global wheel-key emit so only one layer
	// scrolls. No-op outside fullscreen (Ink gates on altScreenActive).
	readonly onWheelAt: (
		col: number,
		row: number,
		deltaY: number,
		deltaX: number,
		button?: number,
	) => boolean;
	// Look up the OSC 8 hyperlink at (col, row) synchronously at click
	// time. Returns the URL or undefined. The browser-open is deferred by
	// MULTI_CLICK_TIMEOUT_MS so double-click can cancel it.
	readonly getHyperlinkAt: (col: number, row: number) => string | undefined;
	// Open a hyperlink URL in the browser. Called after the timer fires.
	readonly onOpenHyperlink: (url: string) => void;
	// Called on double/triple-click PRESS at (col, row). count=2 selects
	// the word under the cursor; count=3 selects the line. Ink reads the
	// screen buffer to find word/line boundaries and mutates selection,
	// setting isDragging=true so a subsequent drag extends by word/line.
	readonly onMultiClick: (col: number, row: number, count: 2 | 3) => void;
	// Called on a left press that begins a text selection (fresh press,
	// modifier press, dormant-drag replay). Lives on Ink like
	// onSelectionDrag: seeding the gesture needs the screen buffer to read
	// the anchor cell's noSelect bit (the direction fence — a drag anchored
	// inside a noSelect region, e.g. the side-panel column, selects that
	// region's text; chat-origin drags keep excluding it).
	readonly onSelectionStart: (col: number, row: number) => void;
	// Called on drag-motion. Mode-aware: char mode updates focus to the
	// exact cell; word/line mode snaps to word/line boundaries. Needs
	// screen-buffer access (word boundaries) so lives on Ink, not here.
	readonly onSelectionDrag: (col: number, row: number) => void;
	// Drag protocol (DOM HTML5 drag subset). Find the drag target at an
	// unmodified left-button press: the deepest node at (col, row) whose
	// ancestor chain (inclusive) carries an onDragStart handler, or null.
	// When non-null, App opens a drag session INSTEAD of text selection /
	// multi-click. Optional so testing.tsx doesn't need to stub it.
	readonly onDragTargetAt?: (col: number, row: number) => DOMElement | null;
	// Dispatch a dragstart/dragmove/dragend DragEvent to the captured drag
	// session target (bubbles through its ancestors). No-op outside
	// fullscreen (Ink gates on altScreenActive). Optional like above.
	readonly onDragDispatch?: (target: DOMElement, event: DragEvent) => void;
	// Gesture latch for Ink's alt-screen health probe: true while a mouse
	// button is held (press seen, no release/reset yet), false otherwise.
	// Ink must not write its blind mode re-assert / DECRQM query mid-gesture
	// — some emulators reset button tracking on DECSET re-assert, silently
	// killing the gesture's motion stream. Optional so testing.tsx doesn't
	// need to stub it.
	readonly onPointerGestureChange?: (active: boolean) => void;
	// Called when the parser captures or releases an SGR mouse protocol
	// candidate (incomplete prefix in flight). This is a PROTOCOL-CANDIDATE
	// latch, not the physical-button latch: it clears on any complete event
	// (mouse or key), ordinary text, paste/response boundary, or the 1s
	// hold deadline. Ink's health probe must not write while a candidate
	// is in flight (a DECSET re-assert mid-report corrupts the stream).
	readonly onProtocolCandidateChange?: (active: boolean) => void;
	// Called after the full release/click/drag tail completes. Ink drains a
	// deferred alt-screen re-entry here — the gesture latch clears at the
	// START of release handling, but the destructive re-entry must wait
	// until dispatchClick has read frontFrame (cellIsBlank, getHyperlinkAt).
	readonly onReleaseTail?: () => void;
	// Called at the batch tail when a release-path click deferred its health
	// probe (deferProbe). Ink issues the skipMouseReassert probe here — after
	// the entire batch is processed, so a `release → next press` chunk never
	// sees the probe write land before the next press latch.
	readonly onClickProbe?: () => void;
	// Called when stdin data arrives after a >STDIN_RESUME_GAP_MS gap.
	// Ink re-asserts terminal modes: extended key reporting, and (when in
	// fullscreen) re-enters alt-screen + mouse tracking. Idempotent on the
	// terminal side. Optional so testing.tsx doesn't need to stub it.
	readonly onStdinResume?: () => void;
	// Called on DECSET-1004 focus events. Ink probes the alt-screen/mouse
	// mode state on refocus — the moment a conpty-side mode reset (DPI
	// change, renderer restart) becomes observable — and self-heals.
	readonly onTerminalFocus?: (focused: boolean) => void;
	// Receives the declared native-cursor position from useDeclaredCursor
	// so ink.tsx can park the terminal cursor there after each frame.
	// Enables IME composition at the input caret and lets screen readers /
	// magnifiers track the input. Optional so testing.tsx doesn't stub it.
	readonly onCursorDeclaration?: CursorDeclarationSetter;
	// Dispatch a keyboard event through the DOM tree. Called for each
	// parsed key alongside the legacy EventEmitter path.
	readonly dispatchKeyboardEvent: (parsedKey: ParsedKey) => void;
};

// Multi-click detection thresholds. 500ms is the macOS default; a small
// position tolerance allows for trackpad jitter between clicks.
const MULTI_CLICK_TIMEOUT_MS = 500;
const MULTI_CLICK_DISTANCE = 1;
type State = {
	readonly error?: Error;
};

/**
 * App-side protocol-candidate latch input (fed to Ink's
 * onProtocolCandidateChange). A gated parser (mouseReportingActive === true)
 * may hold a bare `ESC[` head in the tokenizer before the flush moves it into
 * mouseTailHold; under the gate that buffer is SGR-report-shaped too. A closed
 * gate cannot receive reports, and an absent gate (direct callers) keeps the
 * original `ESC[<`-only test.
 */
function hasMouseProtocolCandidate(state: KeyParseState): boolean {
	if (state.mouseTailHold !== undefined) return true;
	if (state.mouseReportingActive === true)
		return state.incomplete.startsWith("\x1b[");
	if (state.mouseReportingActive === false) return false;
	return state.incomplete.startsWith("\x1b[<");
}

// Root component for all Ink apps
// It renders stdin and stdout contexts, so that children can access them if needed
// It also handles Ctrl+C exiting and cursor visibility
export default class App extends PureComponent<Props, State> {
	static displayName = "InternalApp";
	static getDerivedStateFromError(error: Error) {
		return {
			error,
		};
	}
	override state = {
		error: undefined,
	};

	// Count how many components enabled raw mode to avoid disabling
	// raw mode until all components don't need it anymore
	rawModeEnabledCount = 0;
	internal_eventEmitter = new EventEmitter();
	keyParseState: KeyParseState = {
		...INITIAL_STATE,
		// Capability gate only — the parser lights up once it decodes a record.
		win32Capable: supportsWin32InputMode(),
	};
	// Timer for flushing incomplete escape sequences
	incompleteEscapeTimer: NodeJS.Timeout | null = null;
	// Deferred XTVERSION probe (setImmediate). Cleared on unmount so the
	// DA1 sentinel it flushes cannot land after raw mode is off.
	xtversionProbe: NodeJS.Immediate | null = null;
	xtversionAttempted = false;
	// Timeout durations for incomplete sequences (ms)
	readonly NORMAL_TIMEOUT = 50; // Short timeout for regular esc sequences
	readonly PASTE_TIMEOUT = 500; // Longer timeout for paste operations

	// Terminal query/response dispatch. Responses arrive on stdin (parsed
	// out by parse-keypress) and are routed to pending promise resolvers.
	querier = new TerminalQuerier(this.props.stdout, enabled =>
		this.handleSetRawMode(enabled),
	);

	// Multi-click tracking for double/triple-click text selection. A click
	// within MULTI_CLICK_TIMEOUT_MS and MULTI_CLICK_DISTANCE of the previous
	// click increments clickCount; otherwise it resets to 1.
	lastClickTime = 0;
	lastClickCol = -1;
	lastClickRow = -1;
	clickCount = 0;
	// Deferred hyperlink-open timer — cancelled if a second click arrives
	// within MULTI_CLICK_TIMEOUT_MS (so double-clicking a hyperlink selects
	// the word without also opening the browser). DOM onClick dispatch is
	// NOT deferred — it returns true from onClickAt and skips this timer.
	pendingHyperlinkTimer: ReturnType<typeof setTimeout> | null = null;
	/**
	 * Bitmask of currently held mouse buttons (bit 0 = left, 1 = middle,
	 * 2 = right). Updated in the transport layer of handleMouseEvent BEFORE
	 * the click-disabled gate, so FLAGQAI_DISABLE_MOUSE=1 still maintains
	 * the physical latch. X10's generic release (low bits 3) cannot identify
	 * which button ended and conservatively clears the entire set — a
	 * no-button motion or focus-out is the reliable termination signal.
	 */
	heldButtons = 0;
	/**
	 * Set when an X10 generic release (low bits 3) arrived with buttons still
	 * potentially held — the release carries no button identity, so the probe
	 * stays blocked until a reliable termination signal (no-button motion,
	 * focus-out, or a fresh press identifying the still-held button).
	 */
	ambiguousHeld = false;
	/**
	 * Set when a release, focus-out, or no-button motion cleared the gesture
	 * latch during the current batch. processKeysInBatch drains the deferred
	 * alt-screen re-entry / blocked probe at the batch tail, not mid-batch —
	 * a single stdin chunk can carry `release → next press`, and draining
	 * between them would write probe bytes into the next gesture's opening
	 * window.
	 */
	pendingReleaseTail = false;
	/**
	 * Set when FOCUS_IN arrived during the current batch. The focus probe
	 * (handleTerminalFocusProbe) is deferred to the batch tail so a single
	 * stdin chunk carrying FOCUS_IN + press doesn't write probe bytes before
	 * the press latch is established.
	 */
	pendingFocusProbe = false;
	/**
	 * Set when a release-path click deferred its health probe (deferProbe).
	 * The probe fires at the batch tail via onClickProbe.
	 */
	pendingClickProbe = false;
	// Last mode-1003 motion position. Terminals already dedupe to cell
	// granularity but this also lets us skip dispatchHover entirely on
	// repeat events (drag-then-release at same cell, etc.).
	lastHoverCol = -1;
	lastHoverRow = -1;
	// Active drag session (DOM HTML5 drag subset). Opened on an unmodified
	// left press over a node whose ancestor chain carries an onDragStart
	// handler; `started` flips on the FIRST drag motion — DOM dragstart
	// fires on first move, not on press. lastCol/lastRow track the most
	// recent pointer position so an interrupted session (focus loss,
	// screen swap) can still fire dragend near where the pointer was.
	dragSession: {
		target: DOMElement;
		startCol: number;
		startRow: number;
		lastCol: number;
		lastRow: number;
		started: boolean;
	} | null = null;

	/**
	 * End an in-flight drag session without a release event (focus lost,
	 * screen swap, pointer-state reset): fire dragend at the last known
	 * pointer position so consumers aren't left with an orphan session.
	 * A session that never started (press without movement) ends silently.
	 */
	finishDragSession(): void {
		const session = this.dragSession;
		this.dragSession = null;
		if (session?.started) {
			this.props.onDragDispatch?.(session.target, new DragEvent(
				"dragend", session.lastCol, session.lastRow, session.startCol, session.startRow,
			));
		}
	}

	/**
	 * Reset all transient pointer state. Called by Ink when the alt screen
	 * is entered/exited and on resize: rects, hover targets, and the click
	 * chain from the previous screen geometry/scene must not leak into the
	 * new one (stale hover sets would suppress the next real onMouseEnter;
	 * a stale clickCount could turn the first click on a fresh screen into
	 * a double-click).
	 */
	resetPointerState(): void {
		this.finishDragSession();
		if (this.pendingHyperlinkTimer !== null) {
			clearTimeout(this.pendingHyperlinkTimer);
			this.pendingHyperlinkTimer = null;
		}
		if (this.props.selection.isDragging) {
			finishSelection(this.props.selection);
			this.props.onSelectionChange();
		}
		this.pendingReleaseTail = false;
		this.pendingFocusProbe = false;
		this.pendingClickProbe = false;
		this.lastClickTime = 0;
		this.lastClickCol = -1;
		this.lastClickRow = -1;
		this.clickCount = 0;
		this.lastHoverCol = -1;
		this.lastHoverRow = -1;
	}

	// Timestamp of last stdin chunk. Used to detect long gaps (tmux attach,
	// ssh reconnect, laptop wake) and trigger terminal mode re-assert.
	// Initialized to now so startup doesn't false-trigger.
	lastStdinTime = Date.now();

	// TerminalSizeContext value, renewed only when the dimensions change.
	// A fresh object per App render would re-render every width-aware
	// consumer (MarkdownTable, CodeBlockFrame, panel geometry) on each
	// streaming frame.
	private terminalSizeValue: { columns: number; rows: number } | null = null
	private terminalSizeFor(columns: number, rows: number): { columns: number; rows: number } {
		if (
			this.terminalSizeValue === null ||
			this.terminalSizeValue.columns !== columns ||
			this.terminalSizeValue.rows !== rows
		) {
			this.terminalSizeValue = { columns, rows }
		}
		return this.terminalSizeValue
	}

	// Raw stdout writer for control sequences that must bypass the frame
	// pipeline (alt-screen enter/exit, mouse-tracking toggles, notifications).
	// A class property (not a render-local closure) so the context value keeps
	// a stable identity — a fresh function per render would re-run
	// <AlternateScreen>'s insertion effect every frame, flapping the alt
	// screen on/off.
	writeRaw = (data: string): void => {
		if (data.includes("\x1b[?1049")) {
			logMouseDebug("stdout:1049", { len: data.length, head: data.slice(0, 60) });
		}
		this.props.stdout.write(data);
	};

	// Determines if TTY is supported on the provided stdin
	isRawModeSupported(): boolean {
		return this.props.stdin.isTTY;
	}
	render(): React.JSX.Element {
		const terminalSize = this.terminalSizeFor(this.props.terminalColumns, this.props.terminalRows);
		const visible = this.state.error
			? <ErrorOverview error={this.state.error} />
			: this.props.children;
		return (
			<TerminalWriteProvider value={this.writeRaw}>
				<TerminalSizeContext.Provider value={terminalSize}>
					<AppContext.Provider value={{ exit: this.handleExit, stdout: this.props.stdout }}>
						<StdinContext.Provider value={{
							stdin: this.props.stdin,
							setRawMode: this.handleSetRawMode,
							isRawModeSupported: this.isRawModeSupported(),
							internal_exitOnCtrlC: this.props.exitOnCtrlC,
							internal_eventEmitter: this.internal_eventEmitter,
							internal_querier: this.querier,
						}}>
							<TerminalFocusProvider>
								<ClockProvider>
									<CursorDeclarationContext.Provider value={this.props.onCursorDeclaration ?? (() => {})}>
										{visible}
									</CursorDeclarationContext.Provider>
								</ClockProvider>
							</TerminalFocusProvider>
						</StdinContext.Provider>
					</AppContext.Provider>
				</TerminalSizeContext.Provider>
			</TerminalWriteProvider>
		);
	}
	override componentDidMount() {
		// In accessibility mode, keep the native cursor visible for screen magnifiers and other tools
		if (
			this.props.stdout.isTTY &&
			!isEnvTruthy(process.env.FLAGQAI_ACCESSIBILITY)
		) {
			this.props.stdout.write(HIDE_CURSOR);
		}
	}
	override componentWillUnmount() {
		if (this.props.stdout.isTTY) {
			this.props.stdout.write(SHOW_CURSOR);
		}
		this.detachForShutdown();
	}

	/** Release timers and stdin ownership without requiring a React unmount. */
	detachForShutdown() {
		// Clear any pending timers
		if (this.incompleteEscapeTimer) {
			clearTimeout(this.incompleteEscapeTimer);
			this.incompleteEscapeTimer = null;
		}
		if (this.pendingHyperlinkTimer) {
			clearTimeout(this.pendingHyperlinkTimer);
			this.pendingHyperlinkTimer = null;
		}
		if (this.xtversionProbe) {
			clearImmediate(this.xtversionProbe);
			this.xtversionProbe = null;
		}
		this.querier.dispose();
		// ignore calling setRawMode on an handle stdin it cannot be called
		if (this.isRawModeSupported()) {
			while (this.rawModeEnabledCount > 0) this.handleSetRawMode(false);
		}
	}
	override componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
		// A #185 that reaches the root boundary escaped every enqueue-site
		// guard and was thrown inside React's own commit (e.g. updates
		// chained through an effect); the process-level guard never sees it
		// because the boundary consumes the error. react-reconciler resets
		// its nested-update counter before throwing, so clearing the error
		// remounts the tree from a clean counter and the session survives;
		// the detail goes to crash.log. Recoveries are capped per window;
		// past the cap the error goes to handleExit instead of remounting in
		// a loop.
		if (isNestedUpdateOverflow(error)) {
			if (
				typeof errorInfo?.componentStack === "string" &&
				(error as Error & { componentStack?: string }).componentStack === undefined
			) {
				try {
					(error as Error & { componentStack?: string }).componentStack = errorInfo.componentStack;
				} catch {
					// Frozen error object — the boundary stack is best-effort.
				}
			}
			if (shouldRecoverBoundaryOverflow()) {
				logError(
					new Error(
						"Recovered from React nested-update overflow (#185) at the root boundary — the UI remounts (widget state resets; session data is intact). Full detail in crash.log.",
					),
				);
				try {
					appendCrashLog(serializeCrashDetail(error));
				} catch {
					// Diagnostics must never break the recovery itself.
				}
				// The remount this triggers is a RECOVERY, not a boot: the screen
				// layer reads the mark to keep boot-only surfaces (launchpad,
				// onboarding) closed, so the user lands back in the conversation.
				noteBoundaryRecoveryRemount();
				this.setState({ error: undefined });
				return;
			}
		}
		this.handleExit(error);
	}
	scheduleXtversionProbe = (): void => {
		if (this.xtversionAttempted || this.xtversionProbe !== null) return;
		this.xtversionProbe = setImmediate(() => {
			this.xtversionProbe = null;
			if (this.rawModeEnabledCount === 0 || this.querier.isSuspended) return;
			void Promise.all([
				this.querier.send(xtversion()),
				this.querier.flush(),
			]).then(([r]) => {
				// A handoff may suspend and drain this batch before its sentinel.
				// Leave it retryable once the reply quarantine has ended.
				if (this.querier.isSuspended) return;
				this.xtversionAttempted = true;
				if (r) {
					setXtversionName(r.name);
					logForDebugging(`XTVERSION: terminal identified as "${r.name}"`);
				} else {
					logForDebugging("XTVERSION: no reply (terminal ignored query)");
				}
			});
		});
	};

	handleSetRawMode = (enabled: boolean): void => {
		if (enabled && !this.isRawModeSupported()) {
			throw new Error("Raw mode is not supported on the stdin provided to Ink.\nRead about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported");
		}
		this.rawModeEnabledCount = changeRawModeLease({
			stdin: this.props.stdin,
			stdout: this.props.stdout,
			requests: this.rawModeEnabledCount,
			onReadable: this.handleReadable,
			onFirstEnable: this.scheduleXtversionProbe,
		}, enabled);
	};

	// Helper to flush incomplete escape sequences
	flushIncomplete = (): void => {
		// Clear the timer reference
		this.incompleteEscapeTimer = null;

		// Only proceed if we have incomplete sequences
		if (!this.keyParseState.incomplete) return;

		// Fullscreen: if stdin has data waiting, it's almost certainly the
		// continuation of the buffered sequence (e.g. `[<64;74;16M` after a
		// lone ESC). Node's event loop runs the timers phase before the poll
		// phase, so when a heavy render blocks the loop past 50ms, this timer
		// fires before the queued readable event even though the bytes are
		// already buffered. Re-arm instead of flushing: handleReadable will
		// drain stdin next and clear this timer. Prevents both the spurious
		// Escape key and the lost scroll event.
		if (this.props.stdin.readableLength > 0) {
			this.incompleteEscapeTimer = setTimeout(
				this.flushIncomplete,
				this.NORMAL_TIMEOUT,
			);
			return;
		}

		// Process incomplete as a flush operation (input=null)
		// This reuses all existing parsing logic
		this.processInput(null);
	};

	// Process input through the parser and handle the results
	processInput = (input: string | Buffer | null): void => {
		const previous = this.keyParseState;
		const renderer = instances.get(this.props.stdout);
		const parserState: KeyParseState = {
			...previous,
			win32Capable: supportsWin32InputMode(),
			mouseReportingActive: renderer?.isAltScreenMouseTracking === true,
			terminalExpectedResponseTypes: [...this.querier.pendingResponseTypes],
		};
		const [items, next] = parseMultipleKeypresses(parserState, input);
		this.keyParseState = next;

		const candidateBefore = hasMouseProtocolCandidate(previous);
		const candidateAfter = hasMouseProtocolCandidate(next);
		if (candidateBefore !== candidateAfter) {
			this.props.onProtocolCandidateChange?.(candidateAfter);
		}

		if (input !== null && this.incompleteEscapeTimer !== null) {
			clearTimeout(this.incompleteEscapeTimer);
			this.incompleteEscapeTimer = null;
		}
		if (next.incomplete.length > 0 && this.incompleteEscapeTimer === null) {
			const delay = next.mode === "IN_PASTE" || next.win32Paste?.active
				? this.PASTE_TIMEOUT : this.NORMAL_TIMEOUT;
			this.incompleteEscapeTimer = setTimeout(this.flushIncomplete, delay);
		}

		reconciler.discreteUpdates(processKeysInBatch, this, items, undefined, undefined);
	};
	handleReadable = (): void => {
		this.lastStdinTime = drainReadableInput({
			stdin: this.props.stdin,
			lastActivityAt: this.lastStdinTime,
			consume: this.processInput,
			onReadable: this.handleReadable,
			hasRawModeLease: () => this.rawModeEnabledCount > 0,
			onResume: this.props.onStdinResume,
		});
	};
	handleInput = (input: string | undefined): void => {
		// Exit on Ctrl+C
		if (input === "\x03" && this.props.exitOnCtrlC) {
			this.handleExit();
		}
	};
	handleExit = (error?: Error): void => {
		if (this.isRawModeSupported()) {
			this.handleSetRawMode(false);
		}
		this.props.onExit(error);
	};
	handleTerminalFocus = (isFocused: boolean): void => {
		// setTerminalFocused notifies subscribers: TerminalFocusProvider (context)
		// and Clock (interval speed) — no App setState needed.
		setTerminalFocused(isFocused);
	};
	/**
	 * Re-assert raw mode after an EXTERNAL stop+continue (SIGCONT). While the
	 * job is stopped the shell owns the tty and leaves it in its own cooked
	 * modes; the job is expected to restore its termios when it continues.
	 * The readable listener survives the stop, so only the termios flag comes
	 * back — deliberately not through handleSetRawMode, which would
	 * double-count the raw-mode requests and re-add listeners.
	 *
	 * No `stdin.isRaw` guard: Node caches that flag as a plain property on the
	 * stream, so it still reads `true` after the shell reset termios behind our
	 * back. `setRawMode(true)` is an idempotent ioctl.
	 */
	reassertRawMode = (): void => {
		if (this.rawModeEnabledCount === 0 || !this.isRawModeSupported()) {
			return;
		}
		this.props.stdin.setRawMode(true);
	};
}

// Helper to process all keys within a single discrete update context.
// discreteUpdates expects (fn, a, b, c, d) -> fn(a, b, c, d)
function processKeysInBatch(
	app: App,
	items: ParsedInput[],
	_unused1: undefined,
	_unused2: undefined,
): void {
	dispatchInputBatch(app, items);
}

export { handleMouseEvent };
