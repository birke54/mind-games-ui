import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api/client";
import type { BoardResponse, BoardStatsResponse } from "./api/types";
import App from "./App";

const PUZZLE =
  "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const SOLUTION =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

const solo: BoardResponse = {
  id: 42,
  difficulty: "easy",
  status: "in_progress",
  puzzle: PUZZLE,
  currentState: PUZZLE,
  solution: SOLUTION,
  matchId: null,
  notes: {},
  elapsedSeconds: 0,
  claimedAt: "2026-07-21T00:00:00Z",
  completedAt: null,
  lastModifiedAt: "2026-07-21T00:00:00Z",
};

/** Completed, so `/play/43` renders the solved overlay — the only screen that links to a new game. */
const finished: BoardResponse = {
  ...solo,
  id: 43,
  status: "completed",
  currentState: SOLUTION,
  completedAt: "2026-07-21T00:09:00Z",
};

/** Non-empty, so `/stats` renders the table and its links rather than the empty state. */
const stats: BoardStatsResponse = {
  boardsSolved: 1,
  bestCompletedTime: 540,
  totalPlayTime: 540,
  statsByDifficulty: {
    easy: {
      boardsSolved: 1,
      boardsInProgress: 1,
      bestTime: 540,
      solvedPlayTime: 540,
      totalPlayTime: 540,
    },
    moderate: {
      boardsSolved: 0,
      boardsInProgress: 0,
      bestTime: null,
      solvedPlayTime: 0,
      totalPlayTime: 0,
    },
    hard: { boardsSolved: 0, boardsInProgress: 0, bestTime: null, solvedPlayTime: 0, totalPlayTime: 0 },
  },
};

const refreshAccessToken = vi.spyOn(api, "refreshAccessToken");
const currentUsername = vi.spyOn(api, "currentUsername");
const listBoards = vi.spyOn(api, "listBoards");
const getStats = vi.spyOn(api, "getStats");
const saveProgress = vi.spyOn(api, "saveProgress");
const getMatch = vi.spyOn(api, "getMatch");

/** Boot the whole app — the real route table, the real guard — at `path`. */
function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

/** Both the auth guard and a board still loading render "Loading…"; wait them out. */
const settled = () =>
  waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

beforeEach(() => {
  vi.clearAllMocks();
  refreshAccessToken.mockResolvedValue("token");
  currentUsername.mockReturnValue("ada");
  listBoards.mockResolvedValue([solo, finished]);
  getStats.mockResolvedValue(stats);
  saveProgress.mockResolvedValue(solo);
  getMatch.mockRejectedValue(new Error("no match on a solo board"));
});

afterEach(() => {
  localStorage.clear();
});

describe("the route table", () => {
  const screens: [path: string, heading: string][] = [
    ["/", "Choose your game"],
    ["/games", "Choose your game"],
    ["/sudoku", "Choose a mode"],
    ["/sudoku/solo", "New game"],
    ["/sudoku/multiplayer", "Sudoku multiplayer"],
    ["/stats", "Stats"],
  ];

  it.each(screens)("%s renders its own screen", async (path, heading) => {
    renderAt(path);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(window.location.pathname).toBe(path);
  });

  it("puts an unrecognised path back on the hub", async () => {
    renderAt("/there-is-no-such-screen");

    expect(await screen.findByRole("heading", { name: "Choose your game" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });
});

/**
 * The catch-all is what makes a dead link invisible: a `<Link>` to a path no `<Route>` matches
 * renders and clicks like any other, and `*` quietly redirects it to the hub. Asserting on an href
 * cannot tell a real destination from that — the href is whatever string was typed, and it matches
 * either way. Only mounting the target can, so that is what this does: collect the links a screen
 * actually renders, boot the app at each one, and check it stayed put.
 */
describe("every in-app link", () => {
  const screens = ["/", "/sudoku", "/sudoku/solo", "/sudoku/multiplayer", "/stats", "/play/43"];

  it.each(screens)("on %s points at a route of its own", async (path) => {
    const view = renderAt(path);
    await settled();

    const targets = new Set(
      [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href") ?? ""),
    );
    view.unmount();

    expect(targets.size).toBeGreaterThan(0);

    for (const target of targets) {
      const linked = renderAt(target);
      await settled();

      expect(window.location.pathname, `${target}, linked from ${path}`).toBe(target);
      linked.unmount();
    }
  });
});
