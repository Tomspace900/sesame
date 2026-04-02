// ============================================================
// MAIL PROVIDER ABSTRACTION
// ============================================================

export type Attachment = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  data: Uint8Array | null;
};

export type RawEmail = {
  providerMessageId: string;
  subject: string;
  sender: string;
  receivedAt: Date;
  textPlain: string | null;
  textHtml: string | null;
  attachments: Attachment[];
};

export type BackfillOptions = {
  since: Date;
  batchSize?: number;
  senderPatterns?: string[];
};

export interface IMailProvider {
  readonly providerId: "gmail" | "yahoo" | "outlook";
  setupWatch(userId: string): Promise<void>;
  renewWatch(userId: string): Promise<void>;
  fetchNewEmails(userId: string, since: Date): Promise<RawEmail[]>;
  fetchEmailById(userId: string, emailId: string): Promise<RawEmail | null>;
  fetchHistory(userId: string, options: BackfillOptions): AsyncGenerator<RawEmail>;
}
