import assert from "node:assert/strict";
import test from "node:test";
import { DemoRepository } from "./demo-repository.js";

test("finds cycle-free multi-hop routes with matching detours", async () => {
  const repository = new DemoRepository();
  const result = await repository.planRoute({
    from: "bengaluru",
    to: "nandi-hills",
    interests: ["scenic-rides", "viewpoints", "local-food"],
    maxHops: 6,
  });
  assert.ok(result.routes.length >= 2);
  assert.ok(result.routes.every((route) => route.stops.length >= 3));
  assert.ok(result.recommendations.length > 0);
  assert.ok(result.recommendations.every((item) => item.matched.length > 0));
});

test("related experiences share at least one interest", async () => {
  const repository = new DemoRepository();
  const related = await repository.related("nandi-sunrise");
  assert.ok(related.length > 0);
  assert.ok(related.every((item) => item.sharedInterests.length > 0));
});

test("stores rider state separately from the public travel graph", async () => {
  const repository = new DemoRepository();
  await repository.createRider({ id: "rider-1", name: "Rider", email: "rider@example.com" });
  assert.equal(await repository.saveRiderState("rider-1", { savedTripsJson: "[]" }), true);
  assert.deepEqual(await repository.getRiderState("rider-1"), { savedTripsJson: "[]" });
});
