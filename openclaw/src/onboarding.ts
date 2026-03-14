import type {
  ChannelOnboardingAdapter,
  OpenClawConfig,
  WizardPrompter,
} from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import { isMeepaChatConfigured, type MeepaChatConfig } from "./types";

const channel = "meepachat" as const;

function getMeepaChatConfig(cfg: OpenClawConfig): MeepaChatConfig | undefined {
  return cfg.channels?.meepachat as MeepaChatConfig | undefined;
}

function isConfigured(cfg: OpenClawConfig): boolean {
  const mc = getMeepaChatConfig(cfg);
  return isMeepaChatConfigured(mc?.token, mc?.url);
}

async function noteMeepaChatSetup(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) In MeepaChat, go to Bot Management and create a bot",
      "2) Copy the bot token",
      "3) Use your MeepaChat server URL (e.g., https://chat.example.com)",
      "Tip: the bot must be added to any server you want it to monitor.",
    ].join("\n"),
    "MeepaChat bot setup"
  );
}

export const meepachatOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,

  getStatus: async ({ cfg }) => {
    const configured = isConfigured(cfg);
    const mc = getMeepaChatConfig(cfg);
    const enabled = mc?.enabled !== false;

    return {
      channel,
      configured,
      statusLines: [
        configured
          ? `MeepaChat: configured${enabled ? "" : " (disabled)"}`
          : "MeepaChat: needs bot token + server URL",
      ],
      selectionHint: configured ? "configured" : "needs setup",
      quickstartScore: configured ? 2 : 1,
    };
  },

  configure: async ({ cfg, prompter }) => {
    const accountId = DEFAULT_ACCOUNT_ID ?? "default";
    let next = cfg;
    const mc = getMeepaChatConfig(next);
    const alreadyConfigured = isMeepaChatConfigured(mc?.token, mc?.url);

    let token: string | null = null;
    let url: string | null = null;

    async function promptCredentials(): Promise<void> {
      token = String(
        await prompter.text({
          message: "Enter MeepaChat bot token",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        })
      ).trim();
      url = String(
        await prompter.text({
          message: "Enter MeepaChat server URL",
          placeholder: "https://chat.example.com",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        })
      ).trim();
    }

    if (alreadyConfigured) {
      const keep = await prompter.confirm({
        message: "MeepaChat credentials already configured. Keep them?",
        initialValue: true,
      });
      if (!keep) {
        await promptCredentials();
      }
    } else {
      await noteMeepaChatSetup(prompter);
      await promptCredentials();
    }

    if (token || url) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          meepachat: {
            ...next.channels?.meepachat,
            enabled: true,
            ...(token ? { token } : {}),
            ...(url ? { url: url.replace(/\/+$/, "") } : {}),
          },
        },
      };
    } else if (!alreadyConfigured) {
      // Ensure section exists even if user didn't enter values
      next = {
        ...next,
        channels: {
          ...next.channels,
          meepachat: {
            ...next.channels?.meepachat,
            enabled: true,
          },
        },
      };
    }

    return { cfg: next, accountId };
  },

  disable: (cfg: OpenClawConfig) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      meepachat: { ...cfg.channels?.meepachat, enabled: false },
    },
  }),
};
