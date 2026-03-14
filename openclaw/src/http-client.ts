import https from "node:https";
import type {
  MeepaChatMessage,
  MeepaChatServer,
  MeepaChatChannel,
} from "./types";

interface HttpClientOptions {
  tlsVerify?: boolean;
}

// Per-instance TLS agent for self-signed certs (no global side effects)
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

export class MeepaChatHttpClient {
  private baseUrl: string;
  private botToken: string;
  private tlsVerify: boolean;

  constructor(baseUrl: string, botToken: string, options?: HttpClientOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.botToken = botToken;
    this.tlsVerify = options?.tlsVerify ?? true;
  }

  async sendMessage(
    serverId: string,
    channelId: string,
    content: string,
    threadId?: string,
    attachmentIds?: string[]
  ): Promise<MeepaChatMessage> {
    const body: Record<string, unknown> = { content };
    if (threadId) body.threadId = threadId;
    if (attachmentIds && attachmentIds.length > 0)
      body.attachmentIds = attachmentIds;

    // For DM channels, use the DM endpoint
    if (!serverId || channelId.startsWith("dm-")) {
      return this.request<MeepaChatMessage>(`/api/dms/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    // For server channels, use the server endpoint
    return this.request<MeepaChatMessage>(
      `/api/servers/${serverId}/channels/${channelId}/messages`,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
  }

  async presignUpload(
    filename: string,
    mimeType: string
  ): Promise<{ uploadId: string; uploadUrl: string }> {
    return this.request<{ uploadId: string; uploadUrl: string }>(
      "/api/attachments/presign",
      {
        method: "POST",
        body: JSON.stringify({ filename, mimeType }),
      }
    );
  }

  async uploadFile(
    uploadId: string,
    data: ArrayBuffer,
    filename: string,
    mimeType: string
  ): Promise<{ uploadId: string }> {
    const formData = new FormData();
    formData.append("file", new Blob([data], { type: mimeType }), filename);

    const url = `${this.baseUrl}/api/attachments/upload/${uploadId}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bot ${this.botToken}` },
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MeepaChat upload ${res.status}: ${text}`);
    }

    const json = (await res.json()) as { data?: { uploadId: string }; error?: string };
    if (json.error) throw new Error(`MeepaChat upload error: ${json.error}`);
    return json.data as { uploadId: string };
  }

  /**
   * Download an attachment from this MeepaChat instance using bot auth.
   * No SSRF checks — the URL is constructed from our own server's storedPath.
   */
  async downloadAttachment(
    storedPath: string
  ): Promise<{ data: ArrayBuffer; mimeType: string }> {
    const path = storedPath.replace(/^\/+/, "");
    const url = `${this.baseUrl}/${path}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bot ${this.botToken}` },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      throw new Error(`Attachment download ${res.status}: ${url}`);
    }

    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength > 25 * 1024 * 1024) {
      throw new Error(`Attachment too large (${arrayBuf.byteLength} bytes)`);
    }

    const mimeType =
      res.headers.get("content-type")?.split(";")[0]?.trim() ||
      "application/octet-stream";

    return { data: arrayBuf, mimeType };
  }

  async downloadMedia(
    url: string
  ): Promise<{ data: ArrayBuffer; mimeType: string; filename: string }> {
    // SSRF protection: only allow http/https, block private/loopback IPs
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "metadata.google.internal" ||
      hostname.endsWith(".internal") ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe80") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.startsWith("169.254.")
    ) {
      throw new Error(`Blocked private/internal URL: ${hostname}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Download failed ${res.status}: ${url}`);
      }

      const contentLength = res.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > 25 * 1024 * 1024) {
        throw new Error(`File too large (${contentLength} bytes, max 25 MB)`);
      }

      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength > 25 * 1024 * 1024) {
        throw new Error(
          `File too large (${arrayBuf.byteLength} bytes, max 25 MB)`
        );
      }

      const mimeType =
        res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";

      // Extract filename from Content-Disposition or URL path
      const disposition = res.headers.get("content-disposition");
      let filename = `media-${Date.now()}.png`;
      if (disposition) {
        const match = disposition.match(/filename[^;=\n]*=["']?([^"';\n]+)/);
        if (match?.[1]) filename = match[1];
      } else {
        const urlPath = new URL(url).pathname;
        const basename = urlPath.split("/").pop();
        if (basename && basename.includes(".")) filename = basename;
      }

      return { data: arrayBuf, mimeType, filename };
    } finally {
      clearTimeout(timeout);
    }
  }

  async uploadMediaFromUrl(url: string): Promise<string> {
    const { data, mimeType, filename } = await this.downloadMedia(url);
    const { uploadId } = await this.presignUpload(filename, mimeType);
    await this.uploadFile(uploadId, data, filename, mimeType);
    return uploadId;
  }

  async listServers(): Promise<MeepaChatServer[]> {
    return this.request<MeepaChatServer[]>("/api/servers");
  }

  async listChannels(serverId: string): Promise<MeepaChatChannel[]> {
    return this.request<MeepaChatChannel[]>(
      `/api/servers/${serverId}/channels`
    );
  }

  async addReaction(messageId: string, emoji: string): Promise<void> {
    await this.rawRequest(
      `/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      { method: "PUT" }
    );
  }

  async removeReaction(messageId: string, emoji: string): Promise<void> {
    await this.rawRequest(
      `/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      { method: "DELETE" }
    );
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await this.rawRequest(path, options);

    if (res.status === 204) {
      return undefined as T;
    }

    const json = (await res.json()) as { data?: T; error?: string };
    if (json.error) {
      throw new Error(`MeepaChat API error: ${json.error}`);
    }
    return json.data as T;
  }

  private async rawRequest(
    path: string,
    options?: RequestInit
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const fetchOptions: RequestInit & { dispatcher?: unknown } = {
      ...options,
      headers: {
        Authorization: `Bot ${this.botToken}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    };
    // Use insecure agent for self-signed certs without global side effects
    if (!this.tlsVerify && url.startsWith("https:")) {
      (fetchOptions as any).agent = insecureAgent;
    }
    const res = await fetch(url, fetchOptions);

    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      throw new Error(`MeepaChat API ${res.status}: ${text}`);
    }

    return res;
  }
}
