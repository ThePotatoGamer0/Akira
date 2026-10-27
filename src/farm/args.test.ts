import assert from "node:assert/strict";
import test from "node:test";
import { parseFarmArgs } from "./args.js";

test("farm args take flags or two positional values", () => {
  const flagged = parseFarmArgs(["--url", "http://192.168.0.10:3333/", "--token", "abc"], {});
  assert.equal(flagged.url, "http://192.168.0.10:3333");
  assert.equal(flagged.token, "abc");
  const positional = parseFarmArgs(["http://pi:3333", "secret"], {});
  assert.equal(positional.url, "http://pi:3333");
  assert.equal(positional.token, "secret");
  const short = parseFarmArgs(["192.168.1.42:3333", "7K2M9QPH"], {});
  assert.equal(short.url, "http://192.168.1.42:3333");
  assert.equal(short.token, "7K2M9QPH");
});

test("farm args read the environment when flags are missing", () => {
  const parsed = parseFarmArgs([], { AKIRA_FARM_URL: "http://pi:3333", AKIRA_FARM_TOKEN: "from-env" });
  assert.equal(parsed.url, "http://pi:3333");
  assert.equal(parsed.token, "from-env");
});
