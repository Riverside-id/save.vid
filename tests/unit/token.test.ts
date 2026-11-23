import { describe, expect, it } from "vitest";
import vector from "@/shared/token-vector.json";
import { signToken, verifyToken } from "@/lib/server/token";
import type { MediaTokenPayload } from "@/lib/types";

const secret = "s".repeat(40);
const payload: MediaTokenPayload = { v: 1, u: "https://a.cdninstagram.com/x.mp4", r: null, f: "a.mp4", m: "video/mp4", x: 2_000_000_000 };

describe("media tokens", () => {
  it("verifies a token signed by the Python resolver (cross-language vector)", () => {
    const r = verifyToken(vector.token, vector.secret, vector.now);
    expect(r).toEqual({ ok: true, payload: vector.payload });
  });

  it("round-trips TS-signed tokens", () => {
    expect(verifyToken(signToken(secret, payload), secret, 1_900_000_000)).toEqual({ ok: true, payload });
  });

  it("rejects tampered payloads and signatures", () => {
    const t = signToken(secret, payload);
    const [body, sig] = t.split(".") as [string, string];
    const evil = Buffer.from(JSON.stringify({ ...payload, u: "https://169.254.169.254/" })).toString("base64url");
    expect(verifyToken(`${evil}.${sig}`, secret, 0)).toEqual({ ok: false, reason: "bad-signature" });
    expect(verifyToken(`${body}.${sig.slice(0, -2)}AA`, secret, 0).ok).toBe(false);
    expect(verifyToken(t, "x".repeat(40), 0)).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects expired and malformed tokens", () => {
    expect(verifyToken(signToken(secret, payload), secret, 2_000_000_001)).toEqual({ ok: false, reason: "expired" });
    for (const bad of [null, "", "abc", "a.b.c", "a b.c", "x".repeat(9000)]) expect(verifyToken(bad, secret).ok).toBe(false);
  });

  it("rejects payloads with the wrong shape even when signed", () => {
    const t = signToken(secret, { ...payload, v: 2 } as unknown as MediaTokenPayload);
    expect(verifyToken(t, secret, 0)).toEqual({ ok: false, reason: "invalid-payload" });
  });
});
