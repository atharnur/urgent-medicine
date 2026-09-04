import assert from "node:assert/strict";
import test from "node:test";
import { isSafeReturnTo, isStrongPassword } from "../src/config/security";
import { allowedTransitions } from "../src/modules/delivery/service";
import { env } from "../src/config/env";

test("safe return destinations reject external and protocol-relative URLs", () => {
  assert.equal(isSafeReturnTo("/dashboard"), true);
  assert.equal(isSafeReturnTo("/orders/123?tab=tracking"), true);
  assert.equal(isSafeReturnTo("https://evil.example"), false);
  assert.equal(isSafeReturnTo("//evil.example"), false);
  assert.equal(isSafeReturnTo("/\\evil"), false);
});

test("password policy rejects weak/common passwords", () => {
  assert.equal(isStrongPassword("password123"), false);
  assert.equal(isStrongPassword("AAAAAAAAAAAAAAAA"), false);
  assert.equal(isStrongPassword("StrongEnoughPass123!"), true);
});

test("delivery workflow only permits declared state transitions", () => {
  assert.deepEqual(allowedTransitions.PENDING_ASSIGNMENT, ["ASSIGNED", "CANCELLED"]);
  assert.equal(allowedTransitions.DELIVERED.includes("OUT_FOR_DELIVERY"), false);
  assert.equal(allowedTransitions.CANCELLED.length, 0);
});

test("mandatory delivery charge is server configuration", () => {
  assert.equal(env.deliveryChargeBdt, 220);
});
