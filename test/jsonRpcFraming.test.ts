import { strict as assert } from "node:assert";
import test from "node:test";
import { encodeJsonRpcMessage, JsonRpcFramer } from "../src/cartographer/jsonRpcFraming";

test("frames and parses UTF-8 JSON-RPC messages across chunk boundaries", () => {
  const expected = { id: 7, result: { message: "semantic map" } };
  const encoded = encodeJsonRpcMessage(expected);
  const framer = new JsonRpcFramer();

  assert.deepEqual(framer.push(encoded.subarray(0, 9)), []);
  assert.deepEqual(framer.push(encoded.subarray(9, 23)), []);
  assert.deepEqual(framer.push(encoded.subarray(23)), [expected]);
});
