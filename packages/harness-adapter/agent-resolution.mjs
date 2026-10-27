/** Shared agent resolution coordination; native execution/persistence remain injected. */
export function createAgentResolver(bindings) {
  return async function resolveAgent({ requestedSessionId, configuredRoute, startupRoute, meta, configuredPreset }) {
    const resumeRoute = bindings.explicitRoute(configuredRoute)
    if (requestedSessionId !== undefined) {
      const resumeId = requestedSessionId
      const existing = bindings.existing(resumeId)
      if (existing !== undefined) {
        return { agent: existing, agentPreset: bindings.runningPreset(existing) }
      }
      const reserved = await bindings.reserveMount(requestedSessionId)
      if (!reserved.ok) {
        if (reserved.reason === 'occupied') {
          throw new Error(
            `FlagQAI cannot resume session "${requestedSessionId}": it is mounted by another process ` +
            `(pid ${reserved.holders[0] ?? 0}). Close that client before resuming the same session.`,
          )
        }
        if (reserved.reason === 'busy') {
          throw new Error(
            `FlagQAI cannot resume session "${requestedSessionId}": another process is updating the session mount ledger. Retry in a moment.`,
          )
        }
        throw new Error(
          `FlagQAI cannot resume session "${requestedSessionId}": its occupancy could not be verified (${reserved.detail}).`,
        )
      }
      const reservation = reserved.reservation
      let resumed
      try {
        bindings.prepareResume()
        const persisted = await bindings.persistedPreset(resumeId)
        const composed = await bindings.composePreset(persisted)
        const recorded = await bindings.persistedRoute(resumeId)
        const resumeOptions = {
          provider: resumeRoute?.provider ?? recorded?.provider,
          model: resumeRoute?.model ?? recorded?.model,
        }
        resumed = await bindings.resume(resumeId, resumeOptions, composed.setup)
        return {
          agent: resumed.agent,
          handle: resumed,
          agentPreset: composed.agentPreset,
          route: resumeRoute ?? bindings.recordedRoute(resumed.agent),
        }
      } catch (error) {
        if (resumed !== undefined) {
          try { await bindings.disposeHandle(resumed) }
          catch (cleanupError) { bindings.reportCleanupError(cleanupError) }
        }
        reservation.abandon()
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(
          `FlagQAI cannot resume session "${requestedSessionId}": ${reason}. No fresh session was created instead.`,
          { cause: error },
        )
      } finally {
        reservation.settle()
      }
    }

    const sessionId = bindings.nextSessionId()
    const presetPref = configuredPreset === undefined ? bindings.readPresetPref() : undefined
    const composed = await bindings.composePreset(configuredPreset ?? presetPref)
    if (!bindings.migratePresetPref(presetPref, composed.agentPreset)) {
      bindings.warn(
        `FlagQAI resolved preset preference "${presetPref}" as "${composed.agentPreset}" but could not persist the migrated id`,
      )
    }
    const { route, rejected } = await bindings.validateRoute(startupRoute)
    if (rejected !== undefined) {
      bindings.warn(
        `FlagQAI model route ${rejected.provider}/${rejected.model} is unavailable; falling back to ${route.provider}/${route.model}`,
      )
    }
    const reserved = await bindings.reserveMount(String(sessionId))
    if (!reserved.ok && reserved.reason !== 'occupied') {
      bindings.warn(`FlagQAI could not announce the new session in the mount ledger: ${reserved.reason}`)
    }
    const reservation = reserved.ok ? reserved.reservation : undefined
    let created
    try {
      created = await bindings.create({
        sessionId,
        meta: {
          ...meta,
          ...(composed.agentPreset === undefined ? {} : { agentPreset: composed.agentPreset }),
        },
        route,
        setup: composed.setup,
      })
    } catch (error) {
      reservation?.abandon()
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(
        `FlagQAI failed to create an agent (provider=${route.provider}, model=${route.model}): ${message}`,
        { cause: error },
      )
    }
    reservation?.settle()
    return { agent: created.agent, handle: created, agentPreset: composed.agentPreset, route }
  }
}
