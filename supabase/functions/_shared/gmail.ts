// Gmail API client for Supabase Edge Functions

export type RawEmail = {
  providerMessageId: string;
  subject: string;
  sender: string;
  senderName: string | null;
  receivedAt: Date;
  textPlain: string | null;
  textHtml: string | null;
  hasAttachments: boolean;
};

export type GmailMessage = { id: string; threadId: string };

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; expires_at: Date }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  return {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000),
  };
}

// ---------------------------------------------------------------------------
// Gmail Pub/Sub watch
// ---------------------------------------------------------------------------

export async function setupWatch(
  accessToken: string,
  topicName: string,
): Promise<{ historyId: string; expiration: Date }> {
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/watch",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ topicName, labelIds: ["INBOX"] }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Watch setup failed (${res.status}): ${body}`);
  }

  const data = await res.json() as { historyId: string; expiration: string };
  return {
    historyId: data.historyId,
    expiration: new Date(parseInt(data.expiration, 10)),
  };
}

// ---------------------------------------------------------------------------
// History list (new messages since historyId)
// ---------------------------------------------------------------------------

export async function getHistoryMessages(
  accessToken: string,
  startHistoryId: string,
): Promise<GmailMessage[]> {
  const messages: GmailMessage[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: "messageAdded",
      labelId: "INBOX",
      maxResults: "100",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/history?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`History fetch failed (${res.status}): ${body}`);
    }

    const data = await res.json() as {
      history?: Array<{ messagesAdded?: Array<{ message: GmailMessage }> }>;
      nextPageToken?: string;
    };

    for (const entry of data.history ?? []) {
      for (const added of entry.messagesAdded ?? []) {
        messages.push(added.message);
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return messages;
}

// ---------------------------------------------------------------------------
// Fetch a single message (full format)
// ---------------------------------------------------------------------------

export async function getMessage(
  accessToken: string,
  messageId: string,
): Promise<RawEmail> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Message fetch failed (${res.status}): ${body}`);
  }

  // deno-lint-ignore no-explicit-any
  const msg = await res.json() as Record<string, any>;
  return parseGmailMessage(msg);
}

// ---------------------------------------------------------------------------
// List messages (for backfill)
// ---------------------------------------------------------------------------

export async function listMessages(
  accessToken: string,
  query: string,
  pageToken?: string,
  maxResults = 50,
): Promise<
  {
    messages: GmailMessage[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }
> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });
  if (pageToken) params.set("pageToken", pageToken);

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`List messages failed (${res.status}): ${body}`);
  }

  const data = await res.json() as {
    messages?: GmailMessage[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
  };

  return {
    messages: data.messages ?? [],
    nextPageToken: data.nextPageToken,
    resultSizeEstimate: data.resultSizeEstimate,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
function parseGmailMessage(msg: Record<string, any>): RawEmail {
  const headers: Array<{ name: string; value: string }> =
    msg.payload?.headers ?? [];

  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
      "";

  const subject = getHeader("Subject");
  const from = getHeader("From");

  // Parse "Display Name <email@domain.com>" or plain "email@domain.com"
  const fromMatch = from.match(/^(.+?)\s*<([^>]+)>$/);
  const senderName = fromMatch ? fromMatch[1].trim() || null : null;
  const sender = fromMatch ? fromMatch[2].trim() : from.trim();

  let textPlain: string | null = null;
  let textHtml: string | null = null;
  let hasAttachments = false;

  // deno-lint-ignore no-explicit-any
  const extractParts = (payload: Record<string, any>) => {
    const mimeType: string = payload.mimeType ?? "";
    const bodyData: string | undefined = payload.body?.data;
    const parts: Record<string, unknown>[] | undefined = payload.parts;

    if (mimeType === "text/plain" && bodyData && !textPlain) {
      textPlain = decodeBase64Url(bodyData);
    } else if (mimeType === "text/html" && bodyData && !textHtml) {
      textHtml = decodeBase64Url(bodyData);
    } else if (
      payload.filename &&
      (mimeType.startsWith("application/") ||
        mimeType.startsWith("image/") ||
        payload.body?.attachmentId)
    ) {
      hasAttachments = true;
    }

    if (parts) {
      for (const part of parts) {
        extractParts(part as Record<string, unknown>);
      }
    }
  };

  if (msg.payload) extractParts(msg.payload);

  return {
    providerMessageId: msg.id as string,
    subject,
    sender,
    senderName,
    receivedAt: new Date(parseInt(msg.internalDate as string, 10)),
    textPlain,
    textHtml,
    hasAttachments,
  };
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (base64.length % 4)) % 4;
  const padded = base64 + "=".repeat(padding);

  try {
    const binary = atob(padded);
    // Attempt UTF-8 decode via percent-encoding
    return decodeURIComponent(
      binary.split("").map((c) =>
        "%" + c.charCodeAt(0).toString(16).padStart(2, "0")
      ).join(""),
    );
  } catch {
    // Fallback: return as-is (may contain non-UTF8 chars)
    return atob(padded);
  }
}
