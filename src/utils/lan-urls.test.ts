import assert from "node:assert/strict";
import test from "node:test";
import { farmAdvertisedUrls, ipv4sFromFibTrie, isContainerIpv4, isLanIpv4 } from "./lan-urls.js";

const fib = `
Main:
  +-- 0.0.0.0/1 2 0 2
     |-- 0.0.0.0
        /0 universe UNICAST
     |-- 127.0.0.1
        /32 host LOCAL
     |-- 172.17.0.1
        /32 host LOCAL
     |-- 192.168.1.42
        /32 host LOCAL
     |-- 192.168.1.255
        /32 link BROADCAST
`;

test("fib_trie local host rows are this machine's addresses", () => {
  assert.deepEqual(ipv4sFromFibTrie(fib), ["127.0.0.1", "172.17.0.1", "192.168.1.42"]);
});

test("docker bridges stay off the farm list", () => {
  assert.equal(isContainerIpv4("172.17.0.2"), true);
  assert.equal(isLanIpv4("172.17.0.2"), false);
  assert.equal(isLanIpv4("192.168.1.42"), true);
  assert.equal(isLanIpv4("10.0.0.5"), true);
});

test("afarm advertises the wifi address and an explicit override first", () => {
  const urls = farmAdvertisedUrls({
    env: { WEBUI_SERVER_PORT: "3333", AKIRA_FARM_URL: "http://akira.lan:3333" },
    interfaces: {
      eth0: [{ address: "172.18.0.2", netmask: "255.255.0.0", family: "IPv4", mac: "", internal: false, cidr: null }],
    },
    fibTrie: fib,
    port: 3333,
  });
  assert.equal(urls[0], "http://akira.lan:3333");
  assert.ok(urls.includes("http://192.168.1.42:3333"));
  assert.ok(!urls.some((url) => url.includes("172.18.0.2") || url.includes("172.17.0.1")));
});
