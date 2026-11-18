import test from "node:test";
import assert from "node:assert/strict";
import { createModePolicy } from "../src/mode-policy.js";

const terminal = { type: "terminal", authorized: true };

test("starts paused with no accepted input", () => {
  const policy = createModePolicy({ passageInputs: ["mic-a"], masterInputId: "mic-a" });

  assert.equal(policy.snapshot().mode, "paused");
  assert.deepEqual(policy.snapshot().allowedInputs, []);
  assert.equal(policy.isInputAllowed("mic-a"), false);
});

test("rejects unauthenticated and non-terminal transitions without changing state", () => {
  const policy = createModePolicy({ passageInputs: ["mic-a"], masterInputId: "mic-a" });
  const noOrigin = policy.setMode("passage");
  const voiceOrigin = policy.setMode("passage", { type: "voice", authorized: true });
  const unauthorizedTerminal = policy.setMode("passage", { type: "terminal", authorized: false });

  for (const result of [noOrigin, voiceOrigin, unauthorizedTerminal]) {
    assert.equal(result.ok, false);
    assert.equal(result.reason, "unauthorized_origin");
    assert.equal(result.state.mode, "paused");
  }
});

test("passage accepts only configured input IDs and worship only the configured master", () => {
  const policy = createModePolicy({ passageInputs: ["mic-a", "mic-b"], masterInputId: "mic-b" });

  assert.equal(policy.setMode("passage", terminal).ok, true);
  assert.equal(policy.isInputAllowed("mic-a"), true);
  assert.equal(policy.isInputAllowed("mic-b"), true);
  assert.equal(policy.isInputAllowed("unknown"), false);

  assert.equal(policy.setMode("worship", terminal).ok, true);
  assert.deepEqual(policy.snapshot().allowedInputs, ["mic-b"]);
  assert.equal(policy.isInputAllowed("mic-a"), false);
  assert.equal(policy.isInputAllowed("mic-b"), true);
});

test("worship cannot start until the operator configures a master input", () => {
  const policy = createModePolicy({ passageInputs: ["mic-a"] });
  const rejected = policy.setMode("worship", terminal);

  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "master_not_configured");
  assert.equal(rejected.state.mode, "paused");

  const configured = policy.configure({ passageInputs: ["mic-a"], masterInputId: "mic-a" }, terminal);
  assert.equal(configured.ok, true);
  assert.equal(policy.setMode("worship", terminal).ok, true);
});

test("invalid configuration and configuration without authorized terminal are atomic", () => {
  const policy = createModePolicy({ passageInputs: ["mic-a"], masterInputId: "mic-a" });
  assert.equal(policy.setMode("passage", terminal).ok, true);

  const invalid = policy.configure({ passageInputs: ["mic-a", "mic-a"], masterInputId: "mic-a" }, terminal);
  const unauthorized = policy.configure({ passageInputs: ["mic-b"], masterInputId: "mic-b" }, { type: "voice", authorized: true });

  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, "invalid_configuration");
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.reason, "unauthorized_origin");
  assert.deepEqual(policy.snapshot().passageInputs, ["mic-a"]);
  assert.deepEqual(policy.snapshot().allowedInputs, ["mic-a"]);
});

test("reports inputs removed when mode or configuration narrows access", () => {
  const policy = createModePolicy({ passageInputs: ["mic-a", "mic-b"], masterInputId: "mic-b" });
  policy.setMode("passage", terminal);
  assert.deepEqual(policy.setMode("worship", terminal).removedInputs, ["mic-a"]);

  assert.deepEqual(
    policy.configure({ passageInputs: ["mic-b"], masterInputId: "mic-b" }, terminal).removedInputs,
    [],
  );
  const exitWorship = policy.setMode("paused", terminal);
  assert.deepEqual(exitWorship.removedInputs, ["mic-b"]);
});

test("cannot remove the master while worship is active", () => {
  const policy = createModePolicy({ passageInputs: ["mic-a"], masterInputId: "mic-a" });
  policy.setMode("worship", terminal);

  const result = policy.configure({ passageInputs: ["mic-a"], masterInputId: null }, terminal);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "master_required_in_worship");
  assert.equal(policy.isInputAllowed("mic-a"), true);
});
