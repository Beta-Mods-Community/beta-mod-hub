import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  computeReputation,
  emptyReputationHistory,
  isAlwaysReady,
  reputationTier,
  REPUTATION,
} from "../lib/reputation";

describe("computeReputation", () => {
  it("returns 0 for an empty history", () => {
    assert.equal(computeReputation(emptyReputationHistory), 0);
  });

  it("credits distinct mods tested", () => {
    const score = computeReputation({
      ...emptyReputationHistory,
      distinctModsTested: 3,
    });
    assert.equal(score, 3 * REPUTATION.perModTested);
  });

  it("rates not-ready votes above ready votes (critical signal)", () => {
    // A not-ready vote must outweigh a ready vote — measuring "not ready" is
    // the hard, useful signal for a beta.
    const ready = computeReputation({
      ...emptyReputationHistory,
      distinctModsTested: 1,
      readyVotes: 1,
    });
    const notReady = computeReputation({
      ...emptyReputationHistory,
      distinctModsTested: 1,
      notReadyVotes: 1,
    });
    assert.ok(
      notReady > ready,
      `expected not-ready (${notReady}) > ready (${ready})`,
    );
  });

  it("weights bug reports by severity", () => {
    const blocking = computeReputation({
      ...emptyReputationHistory,
      distinctModsTested: 1,
      blockingBugs: 1,
    });
    const minor = computeReputation({
      ...emptyReputationHistory,
      distinctModsTested: 1,
      minorBugs: 1,
    });
    const base = REPUTATION.perModTested;
    assert.equal(blocking, base + REPUTATION.bug.blocking);
    assert.equal(minor, base + REPUTATION.bug.minor);
    assert.ok((blocking - base) > (minor - base));
  });

  it("discounts a tester who has judged enough mods and never voted not-ready", () => {
    const alwaysReady = computeReputation({
      ...emptyReputationHistory,
      distinctModsTested: REPUTATION.alwaysReadyMinMods,
      readyVotes: REPUTATION.alwaysReadyMinMods,
    });
    assert.ok(isAlwaysReady({
      ...emptyReputationHistory,
      distinctModsTested: REPUTATION.alwaysReadyMinMods,
      readyVotes: REPUTATION.alwaysReadyMinMods,
    }));
    // Without the discount: mods * perMod + all ready at full weight.
    const undiscounted =
      REPUTATION.alwaysReadyMinMods * REPUTATION.perModTested +
      REPUTATION.alwaysReadyMinMods * REPUTATION.readyVote;
    assert.ok(alwaysReady < undiscounted, `${alwaysReady} !< ${undiscounted}`);
  });

  it("does not discount someone with not-ready votes in their history", () => {
    const history = {
      ...emptyReputationHistory,
      distinctModsTested: REPUTATION.alwaysReadyMinMods,
      readyVotes: REPUTATION.alwaysReadyMinMods - 1,
      notReadyVotes: 1,
    };
    assert.equal(isAlwaysReady(history), false);
    const score = computeReputation(history);
    const expected =
      history.distinctModsTested * REPUTATION.perModTested +
      history.readyVotes * REPUTATION.readyVote +
      history.notReadyVotes * REPUTATION.notReadyVote;
    assert.equal(score, expected);
  });

  it("does not call someone always-ready on a tiny sample", () => {
    const history = {
      ...emptyReputationHistory,
      distinctModsTested: REPUTATION.alwaysReadyMinMods - 1,
      readyVotes: REPUTATION.alwaysReadyMinMods - 1,
    };
    assert.equal(isAlwaysReady(history), false);
  });

  it("keeps one decimal place", () => {
    // always-ready with ready votes discounted 0.25: 3 mods * 2 + 3 * 1 * 0.25
    const score = computeReputation({
      ...emptyReputationHistory,
      distinctModsTested: 3,
      readyVotes: 3,
    });
    assert.ok(Number.isInteger(score * 10), `${score} not at 1-decimal grain`);
  });
});

describe("reputationTier", () => {
  it("maps score buckets to tiers", () => {
    assert.equal(reputationTier(0), "New Tester");
    assert.equal(reputationTier(9.9), "Active Tester");
    assert.equal(reputationTier(10), "Experienced Tester");
    assert.equal(reputationTier(19.9), "Experienced Tester");
    assert.equal(reputationTier(20), "Trusted Tester");
  });
});