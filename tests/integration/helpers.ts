import { vi } from "vitest";
import { NextRequest } from "next/server";
import { signToken } from "@/lib/server/token";
import type { MediaTokenPayload } from "@/lib/types";

export const SECRET = "integration-secret-0123456789abcdefghij";

export function setEnv(extra: Record<string, string> = {}) {
  vi.stubEnv("MEDIA_TOKEN_SECRET", SECRET);
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}

export function token(p: Partial<MediaTokenPayload> = {}): string {
  return signToken(SECRET, {
    v: 1,
    u: "https://scontent-test.cdninstagram.com/v/file.mp4?sig=1",
    r: "https://www.instagram.com/",
    f: "socialsaver_ig_test.mp4",
    m: "video/mp4",
    x: Math.floor(Date.now() / 1000) + 600,
    ...p,
  });
}

export function req(url: string, init: { method?: string; headers?: Record<string, string>; body?: BodyInit } = {}) {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: init.method ?? "GET",
    headers: { host: "localhost:3000", "x-forwarded-for": `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...init.headers },
    body: init.body,
  });
}

/** Installs a fetch mock routed by URL substring. */
export function mockFetch(routes: Array<[string | RegExp, (url: string, init?: RequestInit) => Response | Promise<Response>]>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    for (const [match, handler] of routes) {
      if (typeof match === "string" ? url.includes(match) : match.test(url)) return handler(url, init);
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

export function bytes(n: number, fill = 7): Uint8Array<ArrayBuffer> {
  return new Uint8Array(n).fill(fill);
}
