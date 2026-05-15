import { describe, expect, it } from "vitest";
import type { ParsedMail } from "mailparser";
import { buildEmailIngestInputFromParsed, imapConfigFromEnv } from "@/lib/email/imap-sync";

describe("imap email sync", () => {
  it("reads connector config from env", () => {
    expect(imapConfigFromEnv({
      JOB_EMAIL_IMAP_HOST: "imap.example.com",
      JOB_EMAIL_IMAP_USER: "candidate@example.com",
      JOB_EMAIL_IMAP_PASSWORD: "secret",
      JOB_EMAIL_IMAP_LIMIT: "10",
      JOB_EMAIL_IMAP_UNSEEN_ONLY: "true",
    } as unknown as NodeJS.ProcessEnv)).toMatchObject({
      host: "imap.example.com",
      user: "candidate@example.com",
      port: 993,
      secure: true,
      limit: 10,
      unseenOnly: true,
    });
  });

  it("converts parsed mail into email ingest input", () => {
    const parsed = {
      messageId: "<message-1@example.com>",
      from: { text: "Recruiter <recruiter@acme.com>" },
      to: { text: "candidate@example.com" },
      subject: "Availability for next step",
      date: new Date("2026-05-15T12:00:00.000Z"),
      text: "Can you share availability to schedule a call?",
      references: ["<thread-1@example.com>"],
    } as ParsedMail;

    expect(buildEmailIngestInputFromParsed({
      userId: "user_1",
      uid: 42,
      parsed,
    })).toMatchObject({
      userId: "user_1",
      provider: "imap",
      providerMessageId: "<message-1@example.com>",
      threadId: "<thread-1@example.com>",
      from: "Recruiter <recruiter@acme.com>",
      to: ["candidate@example.com"],
      subject: "Availability for next step",
      snippet: "Can you share availability to schedule a call?",
    });
  });
});
