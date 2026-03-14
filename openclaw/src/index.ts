import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { meepachatChannelPlugin } from "./channel";
import { setMeepchatRuntime } from "./runtime";

const plugin: any = {
  id: "@meepa/meepachat-openclaw",
  name: "MeepaChat",
  description: "Connect to MeepaChat (cloud or self-hosted)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setMeepchatRuntime(api.runtime);
    api.registerChannel({ plugin: meepachatChannelPlugin });
  },
};

export default plugin;
