import test from "node:test";
import assert from "node:assert/strict";

import { apiErrorMessage } from "../dist/errors.js";

const UPGRADE = "https://scout.govbidportals.com/api-keys";

test("a limit error keeps its message and carries the upgrade link", () => {
  const msg = apiErrorMessage(
    {
      error: {
        type: "monthly_limit_exceeded",
        message: "Monthly request limit exceeded. Upgrade your plan for more requests.",
        upgrade_url: UPGRADE,
      },
    },
    429,
  );
  assert.match(msg, /Upgrade your plan/);
  assert.match(msg, new RegExp(UPGRADE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("a paid over-cap error also names the overflow packs", () => {
  const msg = apiErrorMessage(
    {
      error: {
        message: "Monthly request limit exceeded. Buy overflow or upgrade to keep your integration running.",
        upgrade_url: UPGRADE,
        packs: [
          { pack: "2k", credits: 2000, price: 25 },
          { pack: "10k", credits: 10000, price: 99 },
        ],
      },
    },
    402,
  );
  assert.match(msg, /2000 credits for \$25/);
  assert.match(msg, /10000 credits for \$99/);
});

test("a plain error body is unchanged", () => {
  assert.equal(apiErrorMessage({ error: { message: "Bad request" } }, 400), "Bad request");
  assert.equal(apiErrorMessage({ error: "nope" }, 500), "nope");
  assert.equal(apiErrorMessage("not json", 502), "API error (HTTP 502)");
  assert.equal(apiErrorMessage(null, 503), "API error (HTTP 503)");
});

test("a malformed packs value is ignored, not printed as junk", () => {
  const msg = apiErrorMessage(
    { error: { message: "cap", upgrade_url: UPGRADE, packs: [null, "x", { credits: 1, price: 2 }] } },
    402,
  );
  assert.match(msg, /1 credits for \$2/);
  assert.doesNotMatch(msg, /null|undefined|NaN/);
});

test("an empty upgrade_url does not add a dangling label", () => {
  const msg = apiErrorMessage({ error: { message: "cap", upgrade_url: "" } }, 429);
  assert.equal(msg, "cap");
});
