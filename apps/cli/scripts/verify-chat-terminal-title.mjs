#!/usr/bin/env node

import assert from 'node:assert/strict'
import { chatTerminalTitle } from '../src/screens/chatTerminalTitle.js'

assert.equal(chatTerminalTitle('✦', ''), '✦ FlagQAI')
assert.equal(chatTerminalTitle('✦', '  Bell-state experiment  '), '✦ FlagQAI · Bell-state experiment')
assert.equal(chatTerminalTitle('⠂', 'Bell-state experiment'), '⠂ FlagQAI · Bell-state experiment')
assert.equal(chatTerminalTitle('⠐', 'Bell-state experiment'), '⠐ FlagQAI · Bell-state experiment')

console.log('FlagQAI terminal tab title OK (idle, working, empty session)')
