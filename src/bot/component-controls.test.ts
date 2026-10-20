import assert from "node:assert/strict";
import test from "node:test";
import { acceptedValues, findControl } from "./component-controls.js";

const rows = [
  {
    type: 1,
    components: [
      { type: 2, custom_id: "shop:n:0:111", label: "Next" },
      { type: 2, custom_id: "kburn:no:abcd", disabled: true },
    ],
  },
  {
    type: 1,
    components: [
      {
        type: 3,
        custom_id: "lookup:pick:111:abc",
        options: [{ value: "char-1" }, { value: "char-2" }],
      },
    ],
  },
];

test("a custom id finds the control on its row", () => {
  assert.equal(findControl(rows, "shop:n:0:111")?.type, 2);
  assert.equal(findControl(rows, "missing"), null);
});

test("a menu only accepts its own choices", () => {
  const menu = findControl(rows, "lookup:pick:111:abc");
  assert.ok(menu);
  assert.equal(acceptedValues(menu, ["char-2"]), true);
  assert.equal(acceptedValues(menu, ["nope"]), false);
  assert.equal(acceptedValues(findControl(rows, "kburn:no:abcd")!, ["char-1"]), false);
});
