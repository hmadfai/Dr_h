import { describe, expect, it, beforeAll } from "vitest";
import { decrypt, encrypt, hmacIndex, randomHex } from "../src/lib/crypto";
import { parseLearner, parseOrganisation } from "../src/lib/validators";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomHex(32);
  process.env.HMAC_KEY = randomHex(32);
});

describe("encryption", () => {
  it("round-trips AES-256-GCM payloads", () => {
    const secret = "QQ123456C";
    const cipher = encrypt(secret);
    expect(cipher.startsWith("enc:")).toBe(true);
    expect(cipher).not.toContain(secret);
    expect(decrypt(cipher)).toBe(secret);
  });

  it("indexes emails case-insensitively", () => {
    expect(hmacIndex("A@TrainingInData.com")).toBe(hmacIndex("a@trainingindata.com"));
  });
});

describe("organisation validation", () => {
  it("rejects an employer without DAS account holder details", () => {
    const form = new FormData();
    form.set("legalName", "Example Ltd");
    form.set("addressLine1", "1 High Street");
    form.set("city", "London");
    form.set("postcode", "W2 1RH");
    form.set("levyStatus", "LEVY");
    const parsed = parseOrganisation(form);
    expect(parsed.data).toBeUndefined();
    expect(parsed.errors.dasHolderName).toBeTruthy();
    expect(parsed.errors.dasAccountId).toBeTruthy();
  });

  it("accepts a complete DAS organisation", () => {
    const form = new FormData();
    form.set("legalName", "Example Ltd");
    form.set("addressLine1", "1 High Street");
    form.set("city", "London");
    form.set("postcode", "W2 1RH");
    form.set("levyStatus", "LEVY");
    form.set("dasAccountId", "DAS-1");
    form.set("dasHolderName", "Alex Jones");
    form.set("dasHolderJobTitle", "FD");
    form.set("dasHolderEmail", "alex@example.com");
    form.set("dasHolderPhone", "020 0000 0000");
    const parsed = parseOrganisation(form);
    expect(parsed.errors).toEqual({});
    expect(parsed.data?.dasHolderName).toBe("Alex Jones");
  });
});

describe("learner validation", () => {
  it("rejects a prospect without line manager details or privacy acknowledgement", () => {
    const form = new FormData();
    form.set("firstName", "Sam");
    form.set("lastName", "Taylor");
    form.set("email", "sam@example.com");
    form.set("organisationId", "org_1");
    form.set("status", "PROSPECT");
    form.set("pipelineStage", "ENQUIRY");
    const parsed = parseLearner(form);
    expect(parsed.data).toBeUndefined();
    expect(parsed.errors.lineManagerName).toBeTruthy();
    expect(parsed.errors.privacyNotice).toBeTruthy();
  });

  it("accepts a prospect with line manager and privacy notice", () => {
    const form = new FormData();
    form.set("firstName", "Sam");
    form.set("lastName", "Taylor");
    form.set("email", "sam@example.com");
    form.set("organisationId", "org_1");
    form.set("status", "PROSPECT");
    form.set("pipelineStage", "ENQUIRY");
    form.set("lineManagerName", "Jamie Fox");
    form.set("lineManagerJobTitle", "Team lead");
    form.set("lineManagerEmail", "jamie@example.com");
    form.set("lineManagerPhone", "07700 900000");
    form.set("privacyNotice", "on");
    const parsed = parseLearner(form);
    expect(parsed.data).toBeDefined();
    expect(parsed.data?.lineManagerEmail).toBe("jamie@example.com");
  });
});
