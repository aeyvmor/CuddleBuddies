import { test } from "node:test";
import assert from "node:assert/strict";
import { allGranted, describePermission } from "./permissions.ts";

test("granted permissions say what they are used for", () => {
  const v = describePermission("CAMERA", { granted: true, status: "granted", canAskAgain: true });
  assert.equal(v.state, "GRANTED");
  assert.match(v.body, /road photos/);
});

test("not asked yet explains why it will be asked", () => {
  for (const p of [null, { granted: false, status: "undetermined", canAskAgain: true }]) {
    const v = describePermission("LOCATION", p);
    assert.equal(v.state, "NOT_ASKED");
    assert.match(v.body, /where each photo was taken/);
  }
});

test("a refusal says what breaks and how to fix it", () => {
  const again = describePermission("LOCATION", { granted: false, status: "denied", canAskAgain: true });
  assert.ok(again.state === "REFUSED" && again.fix === "ASK_AGAIN");
  assert.match(again.body, /cannot start/);
  assert.match(again.body, /Ask again/);
  const blocked = describePermission("CAMERA", { granted: false, status: "denied", canAskAgain: false });
  assert.ok(blocked.state === "REFUSED" && blocked.fix === "OPEN_SETTINGS");
  assert.match(blocked.body, /Open Settings/);
});

test("both permissions are required", () => {
  const yes = { granted: true, status: "granted", canAskAgain: true };
  const no = { granted: false, status: "denied", canAskAgain: true };
  assert.equal(allGranted(yes, yes), true);
  assert.equal(allGranted(yes, no), false);
  assert.equal(allGranted(null, yes), false);
});
