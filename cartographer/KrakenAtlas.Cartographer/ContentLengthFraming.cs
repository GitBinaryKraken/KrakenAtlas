using System.Text;

namespace KrakenAtlas.Cartographer;

internal static class ContentLengthFraming
{
    private static readonly byte[] HeaderTerminator = "\r\n\r\n"u8.ToArray();

    public static async Task<string?> ReadAsync(Stream input, CancellationToken cancellationToken)
    {
        var header = new List<byte>();
        var terminatorIndex = 0;

        while (true)
        {
            var buffer = new byte[1];
            var read = await input.ReadAsync(buffer, cancellationToken);
            if (read == 0)
            {
                return header.Count == 0
                    ? null
                    : throw new EndOfStreamException("Unexpected end of stream while reading a JSON-RPC header.");
            }

            var value = buffer[0];
            header.Add(value);
            terminatorIndex = value == HeaderTerminator[terminatorIndex]
                ? terminatorIndex + 1
                : value == HeaderTerminator[0] ? 1 : 0;

            if (terminatorIndex == HeaderTerminator.Length)
            {
                break;
            }

            if (header.Count > 8192)
            {
                throw new InvalidDataException("JSON-RPC header exceeded 8192 bytes.");
            }
        }

        var headerText = Encoding.ASCII.GetString(header.ToArray());
        var contentLength = ParseContentLength(headerText);
        var body = new byte[contentLength];
        var offset = 0;
        while (offset < contentLength)
        {
            var read = await input.ReadAsync(body.AsMemory(offset, contentLength - offset), cancellationToken);
            if (read == 0)
            {
                throw new EndOfStreamException("Unexpected end of stream while reading a JSON-RPC body.");
            }
            offset += read;
        }

        return Encoding.UTF8.GetString(body);
    }

    public static async Task WriteAsync(Stream output, string json, CancellationToken cancellationToken)
    {
        var body = Encoding.UTF8.GetBytes(json);
        var header = Encoding.ASCII.GetBytes($"Content-Length: {body.Length}\r\n\r\n");
        await output.WriteAsync(header, cancellationToken);
        await output.WriteAsync(body, cancellationToken);
        await output.FlushAsync(cancellationToken);
    }

    private static int ParseContentLength(string header)
    {
        foreach (var line in header.Split("\r\n", StringSplitOptions.RemoveEmptyEntries))
        {
            var separator = line.IndexOf(':');
            if (separator < 0)
            {
                continue;
            }

            var name = line[..separator].Trim();
            var value = line[(separator + 1)..].Trim();
            if (name.Equals("Content-Length", StringComparison.OrdinalIgnoreCase)
                && int.TryParse(value, out var length)
                && length >= 0)
            {
                return length;
            }
        }

        throw new InvalidDataException("JSON-RPC message did not contain a valid Content-Length header.");
    }
}
