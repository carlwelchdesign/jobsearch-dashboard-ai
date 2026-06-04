import { describe, expect, it } from "vitest";
import { selectResumeSourceBullets, summarizeResumeSourceBullets } from "./source-materials";

describe("resume source materials", () => {
  it("keeps approved profile bullets when the latest upload has enough bullets", () => {
    const uploadBullets = Array.from({ length: 8 }, (_, index) => ({
      id: `upload_${index}`,
      text: `Uploaded parsed bullet ${index}`,
      sourceResumeUploadId: "upload_1",
      metrics: {},
    }));
    const digestBullet = {
      id: "digest_revenue",
      text: "Developed React and TypeScript interfaces for sales engagement workflows",
      sourceResumeUploadId: null,
      metrics: { source: "role_description_digest" },
    };

    const selected = selectResumeSourceBullets([...uploadBullets, digestBullet], "upload_1");

    expect(selected.map((bullet) => bullet.id)).toContain("digest_revenue");
    expect(selected[0]).toMatchObject({ id: "digest_revenue" });
  });

  it("summarizes role-description digest bullets for generation notes", () => {
    const selected = [
      { id: "digest_1", text: "Built React workflows", sourceResumeUploadId: null, metrics: { source: "role_description_digest" } },
      { id: "manual_1", text: "Led team delivery", sourceResumeUploadId: null, metrics: {} },
      { id: "upload_1", text: "Shipped SaaS features", sourceResumeUploadId: "upload_1", metrics: {} },
    ];

    expect(summarizeResumeSourceBullets(selected, "upload_1")).toMatchObject({
      totalBulletCount: 3,
      profileBulletCount: 2,
      latestUploadBulletCount: 1,
      roleDescriptionDigestBulletIds: ["digest_1"],
    });
  });
});
