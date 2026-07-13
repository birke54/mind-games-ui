import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NetworkError,
  SessionExpiredError,
  listBoards,
  refreshAccessToken,
  setAccessToken,
  setSessionExpiredHandler,
} from "./client";

/** A Response stand-in; only what the client actually reads. */
const reply = (status: number, body: unknown = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  }) as Response;

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  setAccessToken("stale-token");
  setSessionExpiredHandler(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const isRefresh = (call: unknown[]) => String(call[0]).includes("/refresh");

describe("silent refresh", () => {
  // The backend's JwtAuthenticationFilter lets an expired token through as *anonymous*, and
  // Spring answers 403 rather than 401. If we only refreshed on 401, every session would break
  // at token expiry. Both statuses must trigger a refresh.
  it.each([401, 403])("refreshes and replays when a call is rejected with %i", async (status) => {
    fetchMock
      .mockResolvedValueOnce(reply(status))
      .mockResolvedValueOnce(reply(200, { accessToken: "fresh-token" }))
      .mockResolvedValueOnce(reply(200, [{ id: 1 }]));

    await expect(listBoards()).resolves.toEqual([{ id: 1 }]);

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [, refreshCall, replayCall] = fetchMock.mock.calls;
    expect(isRefresh(refreshCall!)).toBe(true);

    // The replay must carry the NEW token, not the one that just got rejected.
    const replayInit = replayCall![1] as RequestInit;
    const replayHeaders = replayInit.headers as Record<string, string>;
    expect(replayHeaders.Authorization).toBe("Bearer fresh-token");
  });

  it("gives up and reports the session dead when the refresh itself fails", async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);

    fetchMock
      .mockResolvedValueOnce(reply(403))
      .mockResolvedValueOnce(reply(401)); // the refresh cookie is gone too

    await expect(listBoards()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it("does not retry forever when the replay is rejected again", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(403))
      .mockResolvedValueOnce(reply(200, { accessToken: "fresh-token" }))
      .mockResolvedValueOnce(reply(403)); // still refused with a good token

    await expect(listBoards()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // The backend rotates the refresh token on every /refresh and treats a REUSED one as theft,
  // revoking the whole family. Two concurrent refreshes would log the user out. This is the
  // single most important property in this file.
  it("coalesces concurrent refreshes into one request", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/refresh")
        ? reply(200, { accessToken: "fresh-token" })
        : reply(200, []),
    );

    await Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()]);

    expect(fetchMock.mock.calls.filter(isRefresh)).toHaveLength(1);
  });

  it("allows a later refresh once the in-flight one has settled", async () => {
    fetchMock.mockResolvedValue(reply(200, { accessToken: "fresh-token" }));

    await refreshAccessToken();
    await refreshAccessToken();

    expect(fetchMock.mock.calls.filter(isRefresh)).toHaveLength(2);
  });
});

/**
 * A request that never lands says nothing about whether the session is still good. Treating it as
 * a dead session would sign the player out the moment they lose signal — and hide the board they
 * are in the middle of, which the whole offline mirror exists to prevent.
 */
describe("network failures are not auth failures", () => {
  it("reports a NetworkError, not a dead session, when the refresh cannot be sent", async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(refreshAccessToken()).rejects.toBeInstanceOf(NetworkError);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("does not sign the player out when a call is rejected and the refresh cannot be sent", async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);

    fetchMock
      .mockResolvedValueOnce(reply(403)) // token expired
      .mockRejectedValueOnce(new TypeError("Failed to fetch")); // and now we're offline

    await expect(listBoards()).rejects.toBeInstanceOf(NetworkError);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("surfaces a NetworkError from an ordinary call", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(listBoards()).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("public endpoints", () => {
  it("never attempts a refresh when the login itself is rejected", async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { message: "Invalid credentials" }));

    const { authenticate } = await import("./client");
    await expect(authenticate({ username: "u", password: "bad" })).rejects.toThrow(
      "Invalid credentials",
    );

    expect(fetchMock.mock.calls.filter(isRefresh)).toHaveLength(0);
  });
});
