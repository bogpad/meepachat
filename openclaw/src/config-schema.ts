/**
 * JSON Schema for the channels.meepachat config section.
 *
 * Passed to buildChannelConfigSchema() at runtime so OpenClaw can validate
 * user config and the doctor/setup wizard knows what fields to expect.
 *
 * We use a plain JSON Schema object instead of Zod because zod is only
 * available at runtime inside OpenClaw (peer dependency). This avoids
 * needing zod as a local dev dependency while still giving OpenClaw
 * the schema it needs.
 */

export const MeepaChatConfigJsonSchema = {
  type: "object" as const,
  properties: {
    enabled: { type: "boolean" as const },
    url: {
      type: "string" as const,
      description: "MeepaChat server URL (e.g., https://chat.example.com)",
    },
    token: {
      type: "string" as const,
      description: "Bot token (from MeepaChat bot management)",
    },
    tlsVerify: {
      type: "boolean" as const,
      description: "Verify TLS certificates (default: true)",
    },
    retry: {
      type: "object" as const,
      properties: {
        attempts: { type: "number" as const },
        minDelayMs: { type: "number" as const },
        maxDelayMs: { type: "number" as const },
      },
      additionalProperties: false,
    },
    servers: {
      type: "object" as const,
      description: "Per-server filter overrides",
      additionalProperties: true,
    },
  },
  additionalProperties: true,
};
