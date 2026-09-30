import { readFile } from "node:fs/promises";
import { createGateway, generateText } from "ai";

const apiKey = process.env.AI_GATEWAY_API_KEY;
if (!apiKey) throw new Error("Set AI_GATEWAY_API_KEY in your environment.");

const image603 = new Uint8Array(
  await readFile(new URL("../fixtures/noise-603.png", import.meta.url)),
);
const image602 = new Uint8Array(
  await readFile(new URL("../fixtures/noise-602.png", import.meta.url)),
);
const modelId = "anthropic/claude-sonnet-5";
const imageUrl603 = new URL(
  "https://raw.githubusercontent.com/cloudycotton/ai-gateway-bedrock-image-limit-repro/main/fixtures/noise-603.png",
);
const imageUrl602 = new URL(
  "https://raw.githubusercontent.com/cloudycotton/ai-gateway-bedrock-image-limit-repro/main/fixtures/noise-602.png",
);
const useToolUrls = process.argv.includes("--url-tool");
const scenarios = [
  {
    name: "22 smaller images, Bedrock only",
    count: 22,
    imageWidth: 602,
    providers: ["bedrock"],
    expected: "success",
    expectedProvider: "bedrock",
  },
  {
    name: "21 images, Bedrock only",
    count: 21,
    providers: ["bedrock"],
    expected: "success",
    expectedProvider: "bedrock",
  },
  {
    name: "22 images, Bedrock only",
    count: 22,
    providers: ["bedrock"],
    expected: "Input is too long.",
  },
];

if (process.argv.includes("--all")) {
  scenarios.push(
    {
      name: "22 images, Anthropic only",
      count: 22,
      providers: ["anthropic"],
      expected: "success",
      expectedProvider: "anthropic",
    },
    {
      name: "22 images, ordered fallback",
      count: 22,
      providers: ["bedrock", "anthropic"],
      expected: "success",
      expectedProvider: "anthropic",
    },
  );
}

for (const scenario of scenarios) {
  const image = scenario.imageWidth === 602 ? image602 : image603;
  const imageUrl = scenario.imageWidth === 602 ? imageUrl602 : imageUrl603;
  let requestBytes = 0;
  let gatewayStatus;
  const gateway = createGateway({
    apiKey,
    fetch: async (url, init) => {
      if (typeof init?.body === "string") requestBytes = Buffer.byteLength(init.body);
      const response = await fetch(url, init);
      if (typeof init?.body === "string") gatewayStatus = response.status;
      return response;
    },
  });
  const messages = useToolUrls
    ? Array.from({ length: scenario.count }, (_, index) => {
        const toolCallId = `image-${index}`;
        return [
          {
            role: "assistant",
            content: [{ type: "tool-call", toolCallId, toolName: "read_image", input: { index } }],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId,
                toolName: "read_image",
                output: {
                  type: "content",
                  value: [
                    { type: "text", text: `Image ${index + 1}` },
                    { type: "file", data: { type: "url", url: imageUrl }, mediaType: "image/png" },
                  ],
                },
              },
            ],
          },
        ];
      }).flat()
    : [
        {
          role: "user",
          content: [
            { type: "text", text: "Reply exactly OK." },
            ...Array.from({ length: scenario.count }, () => ({
              type: "file",
              data: image,
              mediaType: "image/png",
            })),
          ],
        },
      ];
  if (useToolUrls) messages.push({ role: "user", content: "Reply exactly OK." });
  const providerOptions = {
    gateway: {
      only: scenario.providers,
      order: scenario.providers,
    },
  };

  try {
    const result = await generateText({
      model: gateway(modelId),
      maxRetries: 0,
      maxOutputTokens: 16,
      abortSignal: AbortSignal.timeout(90_000),
      providerOptions,
      messages,
    });
    const routing = result.providerMetadata?.gateway?.routing;
    const providerAttempts = routing?.modelAttempts?.[0]?.providerAttempts?.map((attempt) => ({
      provider: attempt.provider,
      statusCode: attempt.statusCode,
      success: attempt.success,
    }));
    const matchedExpected =
      scenario.expected === "success" && routing?.finalProvider === scenario.expectedProvider;
    console.log(
      JSON.stringify({
        scenario: scenario.name,
        inputMode: useToolUrls ? "tool-result URLs" : "inline image bytes",
        imageCount: scenario.count,
        imageBytes: image.byteLength,
        requestBytes,
        gatewayStatus,
        result: "success",
        finalProvider: routing?.finalProvider,
        providerAttempts,
        matchedExpected,
      }),
    );
    if (!matchedExpected) process.exitCode = 1;
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).replaceAll(
      apiKey,
      "<REDACTED>",
    );
    const matchedExpected =
      message === scenario.expected &&
      error instanceof Error &&
      error.name === "GatewayInternalServerError" &&
      error.statusCode === 400;
    console.log(
      JSON.stringify({
        scenario: scenario.name,
        inputMode: useToolUrls ? "tool-result URLs" : "inline image bytes",
        imageCount: scenario.count,
        imageBytes: image.byteLength,
        requestBytes,
        gatewayStatus,
        result: "error",
        errorName: error instanceof Error ? error.name : undefined,
        errorStatusCode: error?.statusCode,
        errorMessage: message,
        matchedExpected,
      }),
    );
    if (!matchedExpected) process.exitCode = 1;
  }
}
