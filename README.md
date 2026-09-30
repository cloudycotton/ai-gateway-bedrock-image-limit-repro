# AI Gateway / Bedrock image-size reproduction

This repository contains a synthetic, self-contained reproduction of `GatewayInternalServerError: Input is too long.` when Vercel AI Gateway routes Claude Sonnet 5 to Bedrock. It contains no production prompts, image URLs, or credentials.

## Run

Use Bun and set `AI_GATEWAY_API_KEY` securely in your environment. The key is never logged or written by this script.

```sh
bun install --frozen-lockfile
bun run repro
```

`bun run repro` sends the same 603×603 PNG 21 times and then 22 times, with `gateway.only = ["bedrock"]`. Run `bun run repro --all` to also send the 22-image case to Anthropic and with Gateway's Bedrock → Anthropic provider order. Each call allows 16 output tokens and disables SDK retries.

## Observed on 2026-10-01

Runtime: Bun 1.3.14, `ai@7.0.99`, `@ai-sdk/gateway@4.0.80`. The fixture is 1,093,270 bytes.

| Request | AI Gateway request body | Result |
| --- | ---: | --- |
| 21 images, Bedrock only | 30,613,390 bytes | Bedrock 200 |
| 22 images, Bedrock only | 32,071,159 bytes | Gateway HTTP 400, `GatewayInternalServerError: Input is too long.` |
| 22 images, Anthropic only | 32,071,163 bytes | Anthropic 200 |
| 22 images, Bedrock then Anthropic | 32,071,183 bytes | Bedrock 400 twice, Anthropic 200 |

The fixture is one high-entropy PNG repeated in the request. Its SHA-256 is `78166831a5127346d765ee8e8aa9bfd3d290570344f3f7875791122656efa0a3`. The script prints the exact serialized Gateway request size and provider attempt statuses, without printing the key or image bytes.

## Question for the Gateway team

Which component enforces this boundary after the request reaches Gateway? The error is reported as an internal server error even though its status is 400, and the provider-specific size limit is not clear from that response. Could Gateway expose a clear request-size error and document the limit for Bedrock, or preflight the expanded image payload before attempting Bedrock? The ordered-provider route is a working fallback, but its first attempt still fails.

This is a transport and error-reporting reproduction. It does not claim that Bedrock must accept an oversized request or that Gateway must resize the images automatically.
