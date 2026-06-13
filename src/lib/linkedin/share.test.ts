import { describe, expect, it } from "vitest";
import { buildLinkedInShareAuthorizeUrl, buildLinkedInUgcPostPayload, normalizeLinkedInScopes } from "@/lib/linkedin/share";

describe("LinkedIn share helpers", () => {
  it("builds a write-scope authorization URL", () => {
    process.env.LINKEDIN_CLIENT_ID = "client_1";
    process.env.LINKEDIN_CLIENT_SECRET = "secret_1";

    const url = new URL(buildLinkedInShareAuthorizeUrl({ state: "state_1", origin: "http://localhost:3000" }));

    expect(url.searchParams.get("scope")).toContain("w_member_social");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/linkedin/share/callback");
  });

  it("builds LinkedIn UGC payloads for text and image posts", () => {
    expect(buildLinkedInUgcPostPayload({ authorUrn: "urn:li:person:abc", text: "Post text" })).toMatchObject({
      author: "urn:li:person:abc",
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: "Post text" },
          shareMediaCategory: "NONE",
        },
      },
    });

    expect(buildLinkedInUgcPostPayload({
      authorUrn: "urn:li:person:abc",
      text: "Post text",
      mediaAssets: [{ asset: "urn:li:digitalmediaAsset:123", title: "Screenshot" }],
    })).toMatchObject({
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareMediaCategory: "IMAGE",
          media: [{ status: "READY", media: "urn:li:digitalmediaAsset:123" }],
        },
      },
    });
  });

  it("normalizes space and comma separated LinkedIn scopes", () => {
    expect(normalizeLinkedInScopes("openid profile email w_member_social")).toEqual([
      "openid",
      "profile",
      "email",
      "w_member_social",
    ]);
    expect(normalizeLinkedInScopes("email,openid,profile,w_member_social")).toEqual([
      "email",
      "openid",
      "profile",
      "w_member_social",
    ]);
    expect(normalizeLinkedInScopes(["email,openid,profile,w_member_social"])).toEqual([
      "email",
      "openid",
      "profile",
      "w_member_social",
    ]);
  });
});
