# AI Gateway / Bedrock image-size reproduction

This repository contains a synthetic, self-contained reproduction of `GatewayInternalServerError: Input is too long.` when Vercel AI Gateway routes Claude Sonnet 5 to Bedrock. It contains no production prompts, image URLs, or credentials.

## Run

Use Bun and set `AI_GATEWAY_API_KEY` securely in your environment. The key is never logged or written by this script.

```sh
bun install --frozen-lockfile
bun run repro --url-tool
bun run repro
```

`bun run repro` compares 22 copies of a 602×602 PNG with 22 copies of a 603×603 PNG, plus a 21-copy control, using `gateway.only = ["bedrock"]`. Run `bun run repro --url-tool` for the same comparison with public fixture URLs returned by tool calls. That mode mirrors an image-heavy tool history while keeping the client-to-Gateway body small. Add `--all` to either command to also try Anthropic alone and Gateway's Bedrock → Anthropic provider order. Each call allows 16 output tokens and disables SDK retries.

## Observed on 2026-10-01

Runtime: Bun 1.3.14, `ai@7.0.99`, `@ai-sdk/gateway@4.0.80`.

| Request | AI Gateway request body | Result |
| --- | ---: | --- |
| 22 smaller 602×602 images, Bedrock only | 31,964,679 bytes | Bedrock 200 |
| 21 images, Bedrock only | 30,613,390 bytes | Bedrock 200 |
| 22 images, Bedrock only | 32,071,159 bytes | Gateway HTTP 400, `GatewayInternalServerError: Input is too long.` |
| 22 images, Anthropic only | 32,071,163 bytes | Anthropic 200 |
| 22 images, Bedrock then Anthropic | 32,071,183 bytes | Bedrock 400 twice, Anthropic 200 |

Each fixture is one high-entropy PNG repeated in the request. The 602×602 file is 1,089,642 bytes (SHA-256 `d804f4cabd7efef65a19662aabddca390c5840206080fded8806698e6a030502`); the 603×603 file is 1,093,270 bytes (SHA-256 `78166831a5127346d765ee8e8aa9bfd3d290570344f3f7875791122656efa0a3`). The script prints the exact serialized Gateway request size and provider attempt statuses, without printing the key or image bytes.

The URL-based mode is the closer analogue to the production tool-result history. Gateway receives a small body with public image URLs; the provider attempt fails after those URLs are expanded:

| Request | AI Gateway request body | Result |
| --- | ---: | --- |
| 22 smaller 602×602 tool-result URLs, Bedrock only | 10,674 bytes | Bedrock 200 |
| 21 tool-result URLs, Bedrock only | 10,198 bytes | Bedrock 200 |
| 22 tool-result URLs, Bedrock only | 10,674 bytes | Gateway HTTP 400, `GatewayInternalServerError: Input is too long.` |
| 22 tool-result URLs, Anthropic only | 10,678 bytes | Anthropic 200 |
| 22 tool-result URLs, Bedrock then Anthropic | 10,698 bytes | Bedrock 400 twice, Anthropic 200 |

The two 22-URL requests have the same client-to-Gateway body size and image count, but different outcomes. This isolates the boundary to the expanded image content or a downstream transformation. No production URL or prompt is included here.

## Question for the Gateway team

Which component enforces this boundary after Gateway expands image URLs? The error is reported as an internal server error even though its status is 400, and the provider-specific size limit is not clear from that response. Could Gateway expose a clear request-size error and document the limit for Bedrock, or preflight the expanded image payload before attempting Bedrock? The ordered-provider route is a working fallback, but its first attempt still fails.

This is a transport and error-reporting reproduction. It does not claim that Bedrock must accept an oversized request or that Gateway must resize the images automatically.
