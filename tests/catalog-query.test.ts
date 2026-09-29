import assert from "node:assert/strict";
import { test } from "node:test";
import { browseUrl, catalogPage, escapeLike } from "../lib/catalog-query";
test("catalog rejects invalid page inputs and bounds offsets", () => {
  for (const value of [undefined, "no", -1, 0, 1.5, Infinity]) assert.equal(catalogPage(value), 1);
  assert.equal(catalogPage("2"), 2);
  assert.equal(catalogPage(100001), 100000);
});
test("search escapes SQL wildcard characters as literal input", () => assert.equal(escapeLike("100%_mod\\"), "100\\%\\_mod\\\\"));
test("pagination preserves search, game and sort safely", () => {
  assert.equal(browseUrl({ q: "a&b", game: "Skyrim", sort: "needs-testers", page: 2 }), "/browse?q=a%26b&game=Skyrim&sort=needs-testers&page=2");
});
