import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTutorResponse, GroqError } from "@/lib/ai/groqProvider";

const BASE = {
  grade: "grade3",
  lessonTitle: "Meaning of fractions",
  userMessage: "What is a half?",
  history: [{ sender: "user" as const, text: "hi" }],
};

function reply(status: number, body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "test-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getTutorResponse", () => {
  it("returns the trimmed answer and sends the learner profile in the system prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { choices: [{ message: { content: "  One of two equal parts.  " } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const answer = await getTutorResponse({ ...BASE, learnerContext: "LEARNER PROFILE\nRecommended difficulty: easy" });
    expect(answer).toBe("One of two equal parts.");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init.body);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("Recommended difficulty: easy");
    expect(body.messages[0].content).toContain("Practice questions you write in chat are for learning only");
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "What is a half?" });
  });

  it("omits the learner-profile rules when there is no profile", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { choices: [{ message: { content: "ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    await getTutorResponse(BASE);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content).not.toContain("LEARNER PROFILE");
  });

  it("fails clearly when the API key is missing", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getTutorResponse(BASE)).rejects.toMatchObject({ kind: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports rate limiting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(429, "slow down")));
    await expect(getTutorResponse(BASE)).rejects.toMatchObject({ kind: "rate-limited", status: 429 });
  });

  it("reports an upstream error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(500, "boom")));
    const err = await getTutorResponse(BASE).catch((e) => e);
    expect(err).toBeInstanceOf(GroqError);
    expect(err).toMatchObject({ kind: "upstream", status: 500 });
  });

  it("reports a timeout", async () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
    await expect(getTutorResponse(BASE)).rejects.toMatchObject({ kind: "timeout" });
  });

  it("reports a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(getTutorResponse(BASE)).rejects.toMatchObject({ kind: "upstream", status: 0 });
  });

  it("rejects an empty completion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, { choices: [{ message: { content: "   " } }] })));
    await expect(getTutorResponse(BASE)).rejects.toMatchObject({ kind: "empty" });
  });
});
