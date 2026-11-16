import test from "node:test";
import assert from "node:assert/strict";
import { parseSSHCommand } from "../src/state/ssh-command.ts";
test("connection commands resolve without forwarding flags or shell execution", () => {
  const value = parseSSHCommand(
    'ssh -CAXY -p 2200 -l researcher -i "~/.ssh/research key" host',
  );
  assert.equal(value.target, "researcher@host");
  assert.equal(value.port, 2200);
  assert.equal(value.identity, "~/.ssh/research key");
  assert.match(value.notice, /forwarding stay disabled/);
  assert.equal(parseSSHCommand("ssh user@host", 2222).port, 22);
  assert.equal(parseSSHCommand("research-server", 2222).port, 2222);
  assert.equal(parseSSHCommand("ssh -p2222 -- user@host").port, 2222);
});
test("reject incomplete commands, execution, forwarding and security overrides", () => {
  for (const value of [
    "ssh",
    "ssh -p",
    "ssh -p0 host",
    "ssh -p22junk host",
    'ssh "host',
    "ssh host bash",
    "ssh host;whoami",
    "ssh host && whoami",
    "ssh -oProxyCommand=evil host",
    "ssh -o StrictHostKeyChecking=no host",
    "ssh -L8080:secret:80 host",
    'ssh -i "-evil" host',
    "ssh -l bob alice@host",
    "ssh -l bob",
    "ssh user@",
  ]) {
    assert.throws(() => parseSSHCommand(value), undefined, value);
  }
});
