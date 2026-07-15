export class JsonRpcFramer {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: unknown[] = [];

    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) {
        break;
      }

      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const contentLength = parseContentLength(header);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;
      if (this.buffer.length < bodyEnd) {
        break;
      }

      const body = this.buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      messages.push(JSON.parse(body) as unknown);
      this.buffer = this.buffer.subarray(bodyEnd);
    }

    return messages;
  }
}

export function encodeJsonRpcMessage(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii");
  return Buffer.concat([header, body]);
}

function parseContentLength(header: string): number {
  for (const line of header.split("\r\n")) {
    const separator = line.indexOf(":");
    if (separator < 0) {
      continue;
    }
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (name.toLowerCase() === "content-length") {
      const length = Number.parseInt(value, 10);
      if (Number.isInteger(length) && length >= 0) {
        return length;
      }
    }
  }
  throw new Error("JSON-RPC message is missing a valid Content-Length header.");
}
