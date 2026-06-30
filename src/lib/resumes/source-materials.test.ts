import { describe, expect, it } from "vitest";
import {
  selectResumeSourceBullets,
  selectResumeSourceWorkExperiences,
  summarizeResumeSourceBullets,
} from "./source-materials";

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

  it("drops profile work experiences that are aliases of the latest upload", () => {
    const selected = selectResumeSourceWorkExperiences(
      [
        workExperience({
          id: "upload_taser",
          company: "TASER International / AXON",
          title: "Front End Developer",
          startDate: "Apr 2009",
          endDate: "Oct 2011",
          sourceResumeUploadId: "upload_1",
        }),
        workExperience({
          id: "profile_taser",
          company: "Taser International",
          title: "Front End Developer",
          sourceResumeUploadId: null,
        }),
        workExperience({
          id: "profile_gd_rd",
          company: "General Dynamics Land Systems",
          title: "Manager / Lead Developer of R&D: VR & AR Applications",
          sourceResumeUploadId: null,
        }),
        workExperience({
          id: "upload_gd",
          company: "General Dynamics Land Systems",
          title: "Manager / Lead Developer",
          startDate: "2001",
          endDate: "2004",
          sourceResumeUploadId: "upload_1",
        }),
        workExperience({
          id: "profile_distinct",
          company: "Acme",
          title: "Design Manager",
          startDate: "2010",
          endDate: "2012",
          sourceResumeUploadId: null,
        }),
      ],
      "upload_1",
    );

    expect(selected.map((work) => work.id)).toEqual([
      "upload_taser",
      "upload_gd",
      "profile_distinct",
    ]);
  });
});

function workExperience(input: {
  id: string;
  company: string;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  sourceResumeUploadId?: string | null;
}) {
  return {
    startDate: null,
    endDate: null,
    sourceResumeUploadId: null,
    ...input,
  };
}
