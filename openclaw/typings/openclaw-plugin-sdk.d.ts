/**
 * Local type stubs for openclaw/plugin-sdk.
 *
 * The real package is only available at runtime inside an OpenClaw instance
 * (it's a peer dependency). These stubs let `tsc` resolve imports during
 * local development without hacks.
 *
 * Keep in sync with the upstream SDK types:
 *   https://github.com/openclaw/openclaw/blob/main/src/channels/plugins/types.plugin.ts
 *   https://github.com/openclaw/openclaw/blob/main/src/channels/plugins/types.adapters.ts
 *   https://github.com/openclaw/openclaw/blob/main/src/channels/plugins/types.core.ts
 */

declare module 'openclaw/plugin-sdk' {
  // ---- Constants ----

  export const DEFAULT_ACCOUNT_ID: string

  // ---- Config ----

  export type OpenClawConfig = Record<string, any>

  // ---- Channel Plugin ----

  export type ChannelPlugin<ResolvedAccount = any, Probe = unknown, Audit = unknown> = {
    id: string
    meta: ChannelMeta
    capabilities: ChannelCapabilities
    defaults?: { queue?: { debounceMs?: number } }
    reload?: { configPrefixes: string[]; noopPrefixes?: string[] }
    onboarding?: ChannelOnboardingAdapter
    config: ChannelConfigAdapter<ResolvedAccount>
    configSchema?: any
    setup?: ChannelSetupAdapter
    pairing?: any
    security?: any
    groups?: any
    mentions?: any
    outbound?: ChannelOutboundAdapter
    status?: ChannelStatusAdapter<ResolvedAccount, Probe, Audit>
    gatewayMethods?: string[]
    gateway?: ChannelGatewayAdapter<ResolvedAccount>
    auth?: any
    elevated?: any
    commands?: any
    streaming?: any
    threading?: any
    messaging?: any
    agentPrompt?: any
    directory?: ChannelDirectoryAdapter
    resolver?: any
    actions?: any
    heartbeat?: any
    agentTools?: any
  }

  // ---- Meta & Capabilities ----

  export type ChannelMeta = {
    id: string
    label: string
    selectionLabel?: string
    detailLabel?: string
    docsPath?: string
    docsLabel?: string
    blurb?: string
    systemImage?: string
    aliases?: string[]
    order?: number
  }

  export type ChannelCapabilities = {
    chatTypes: readonly string[]
    threads?: boolean
    media?: boolean
  }

  // ---- Config Adapter ----

  export type ChannelConfigAdapter<ResolvedAccount = any> = {
    listAccountIds: (cfg: OpenClawConfig) => string[]
    resolveAccount: (cfg: OpenClawConfig, accountId?: string | null) => ResolvedAccount
    defaultAccountId?: (cfg: OpenClawConfig) => string
    setAccountEnabled?: (params: { cfg: OpenClawConfig; accountId: string; enabled: boolean }) => OpenClawConfig
    deleteAccount?: (params: { cfg: OpenClawConfig; accountId: string }) => OpenClawConfig
    isEnabled?: (account: ResolvedAccount, cfg: OpenClawConfig) => boolean
    isConfigured?: (account: ResolvedAccount, cfg: OpenClawConfig) => boolean | Promise<boolean>
    describeAccount?: (account: ResolvedAccount, cfg: OpenClawConfig) => ChannelAccountSnapshot
    resolveAllowFrom?: (params: { cfg: OpenClawConfig; accountId?: string | null }) => string[] | undefined
    formatAllowFrom?: (params: { cfg: OpenClawConfig; accountId?: string | null; allowFrom: Array<string | number> }) => string[]
  }

  // ---- Status Adapter ----

  export type ChannelAccountSnapshot = Record<string, any>

  export type ChannelStatusAdapter<ResolvedAccount = any, Probe = unknown, Audit = unknown> = {
    defaultRuntime?: ChannelAccountSnapshot
    buildChannelSummary?: (params: { account: ResolvedAccount; cfg: OpenClawConfig; defaultAccountId: string; snapshot: ChannelAccountSnapshot }) => Record<string, unknown> | Promise<Record<string, unknown>>
    probeAccount?: (params: { account: ResolvedAccount; timeoutMs: number; cfg: OpenClawConfig }) => Promise<Probe>
    auditAccount?: (params: { account: ResolvedAccount; timeoutMs: number; cfg: OpenClawConfig; probe?: Probe }) => Promise<Audit>
    buildAccountSnapshot?: (params: { account: ResolvedAccount; cfg: OpenClawConfig; runtime?: ChannelAccountSnapshot; probe?: Probe; audit?: Audit }) => ChannelAccountSnapshot | Promise<ChannelAccountSnapshot>
    collectStatusIssues?: (accounts: ChannelAccountSnapshot[]) => any[]
  }

  // ---- Gateway Adapter ----

  export type ChannelLogSink = {
    info: (msg: string) => void
    warn: (msg: string) => void
    debug?: (msg: string) => void
  }

  export type ChannelGatewayContext<ResolvedAccount = unknown> = {
    cfg: OpenClawConfig
    accountId: string
    account: ResolvedAccount
    runtime: RuntimeEnv
    abortSignal: AbortSignal
    log?: ChannelLogSink
    getStatus: () => ChannelAccountSnapshot
    setStatus: (next: ChannelAccountSnapshot) => void
  }

  export type ChannelGatewayAdapter<ResolvedAccount = unknown> = {
    startAccount?: (ctx: ChannelGatewayContext<ResolvedAccount>) => Promise<unknown>
    stopAccount?: (ctx: ChannelGatewayContext<ResolvedAccount>) => Promise<void>
    loginWithQrStart?: (params: any) => Promise<any>
    loginWithQrWait?: (params: any) => Promise<any>
    logoutAccount?: (ctx: any) => Promise<any>
  }

  // ---- Outbound Adapter ----

  export type ChannelOutboundAdapter = {
    deliveryMode: 'direct' | 'gateway' | 'hybrid'
    chunker?: ((text: string, limit: number) => string[]) | null
    chunkerMode?: 'text' | 'markdown'
    textChunkLimit?: number
    resolveTarget?: (params: any) => { ok: true; to: string } | { ok: false; error: Error }
    sendText?: (ctx: any) => Promise<any>
    sendMedia?: (ctx: any) => Promise<any>
    sendPoll?: (ctx: any) => Promise<any>
  }

  // ---- Directory Adapter ----

  export type ChannelDirectoryEntry = {
    id: string
    kind: string
    name: string
    label?: string
    note?: string
  }

  export type ChannelDirectoryAdapter = {
    self?: (params: { cfg: OpenClawConfig; accountId?: string | null; runtime: RuntimeEnv }) => Promise<ChannelDirectoryEntry | null>
    listPeers?: (params: { cfg: OpenClawConfig; accountId?: string | null; query?: string | null; limit?: number | null; runtime: RuntimeEnv }) => Promise<ChannelDirectoryEntry[]>
    listGroups?: (params: { cfg: OpenClawConfig; accountId?: string | null; query?: string | null; limit?: number | null; runtime: RuntimeEnv }) => Promise<ChannelDirectoryEntry[]>
    listGroupMembers?: (params: { cfg: OpenClawConfig; accountId?: string | null; groupId: string; limit?: number | null; runtime: RuntimeEnv }) => Promise<ChannelDirectoryEntry[]>
  }

  // ---- Onboarding Adapter ----

  export type WizardPrompter = {
    text: (opts: { message: string; placeholder?: string; initialValue?: string; validate?: (value: string) => string | undefined }) => Promise<string>
    confirm: (opts: { message: string; initialValue?: boolean }) => Promise<boolean>
    select: <T extends string>(opts: { message: string; options: Array<{ value: T; label: string; hint?: string }>; initialValue?: T }) => Promise<T>
    note: (message: string, title?: string) => Promise<void>
  }

  export type ChannelOnboardingStatus = {
    channel: string
    configured: boolean
    statusLines: string[]
    selectionHint?: string
    quickstartScore?: number
  }

  export type ChannelOnboardingAdapter = {
    channel: string
    getStatus: (params: { cfg: OpenClawConfig }) => Promise<ChannelOnboardingStatus>
    configure: (params: {
      cfg: OpenClawConfig
      prompter: WizardPrompter
      accountOverrides: Record<string, string | undefined>
      shouldPromptAccountIds: boolean
    }) => Promise<{ cfg: OpenClawConfig; accountId: string }>
    disable: (cfg: OpenClawConfig) => OpenClawConfig
  }

  // ---- Setup Adapter ----

  export type ChannelSetupAdapter = {
    resolveAccountId?: (params: { accountId?: string | null }) => string
    applyAccountName?: (params: { cfg: OpenClawConfig; accountId: string; name?: string }) => OpenClawConfig
    validateInput?: (params: { accountId: string; input: Record<string, any> }) => string | null
    applyAccountConfig?: (params: { cfg: OpenClawConfig; accountId: string; input: Record<string, any> }) => OpenClawConfig
  }

  // ---- Plugin API ----

  export type RuntimeEnv = any

  export type PluginRuntime = any

  export interface OpenClawPluginApi {
    runtime: PluginRuntime
    registerChannel: (opts: { plugin: ChannelPlugin }) => void
    registerGatewayMethod?: (name: string, handler: any) => void
  }

  // ---- Helpers ----

  export function emptyPluginConfigSchema(): any

  export function buildChannelConfigSchema(schema: any): any

  export function normalizeAccountId(accountId?: string | null): string

  export function setAccountEnabledInConfigSection(params: {
    cfg: OpenClawConfig
    sectionKey: string
    accountId: string
    enabled: boolean
    allowTopLevel?: boolean
  }): OpenClawConfig

  export function deleteAccountFromConfigSection(params: {
    cfg: OpenClawConfig
    sectionKey: string
    accountId: string
    clearBaseFields?: string[]
  }): OpenClawConfig

  export function applyAccountNameToChannelSection(params: {
    cfg: OpenClawConfig
    channelKey: string
    accountId: string
    name?: string
  }): OpenClawConfig

  export function createReplyPrefixOptions(params: {
    cfg: OpenClawConfig
    agentId?: string
    channel: string
    accountId?: string
  }): any

  export type TypingCallbacks = {
    onReplyStart: () => Promise<void>
    onIdle?: () => void
    onCleanup?: () => void
  }

  export function createTypingCallbacks(params: {
    start: () => void | Promise<void>
    stop?: () => void | Promise<void>
    intervalMs?: number
    onStartError?: (err: unknown) => void
    onStopError?: (err: unknown) => void
  }): TypingCallbacks
}
