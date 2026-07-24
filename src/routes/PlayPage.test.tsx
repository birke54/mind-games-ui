import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/client";
import { ApiError, NetworkError } from "../api/client";
import type { BoardResponse, MatchPlayer, MatchResponse } from "../api/types";
import PlayPage from "./PlayPage";

const PUZZLE =
  "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const SOLUTION =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

const VIEWER = "ada";

/** A board dealt for a race: the server withholds the solution until this player finishes. */
const matchBoard: BoardResponse = {
  id: 7,
  difficulty: "easy",
  status: "in_progress",
  puzzle: PUZZLE,
  currentState: PUZZLE,
  solution: null,
  matchId: 99,
  notes: {},
  elapsedSeconds: 0,
  claimedAt: "2026-07-21T00:00:00Z",
  completedAt: null,
  lastModifiedAt: "2026-07-21T00:00:00Z",
};

const me: MatchPlayer = { userId: 1, username: VIEWER, correctCells: 40, finishedAt: null };
const opponent: MatchPlayer = {
  userId: 2,
  username: "grace",
  correctCells: 81,
  finishedAt: "2026-07-21T00:04:00Z",
};

const activeMatch: MatchResponse = {
  id: 99,
  joinCode: "ABCD",
  difficulty: "easy",
  status: "active",
  boardId: 7,
  hostUserId: 1,
  winnerUserId: null,
  players: [me, opponent],
  startedAt: "2026-07-21T00:00:00Z",
  finishedAt: null,
};

const finishedBy = (winner: MatchPlayer): MatchResponse => ({
  ...activeMatch,
  status: "finished",
  winnerUserId: winner.userId,
  finishedAt: "2026-07-21T00:04:00Z",
});

const listBoards = vi.spyOn(api, "listBoards");
const getMatch = vi.spyOn(api, "getMatch");
const saveProgress = vi.spyOn(api, "saveProgress");
const currentUsername = vi.spyOn(api, "currentUsername");

function renderPlay(board: BoardResponse) {
  listBoards.mockResolvedValue([board]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/play/${board.id}`]}>
        <Routes>
          <Route path="/play/:boardId" element={<PlayPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const lossOverlay = () => screen.queryByText("Opponent finished first");
/** The solo completion overlay, which a race board must never fall back to. */
const solvedOverlay = () => screen.queryByText("Solved");

beforeEach(() => {
  // Cleared rather than restored: restoring detaches these spies from the module, and every test
  // here needs them installed.
  vi.clearAllMocks();
  currentUsername.mockReturnValue(VIEWER);
  getMatch.mockResolvedValue(activeMatch);
  saveProgress.mockResolvedValue(matchBoard);
});

afterEach(() => {
  localStorage.clear();
});

/**
 * The overlay that ends a race for the player who did not win it. Their own board is still
 * in_progress — nothing about it freezes — so this is the only thing that tells them it is over,
 * and it arrives from the match poll rather than from any save of theirs.
 */
describe("the race result overlay", () => {
  it("names the winner once the opponent finishes first", async () => {
    getMatch.mockResolvedValue(finishedBy(opponent));

    renderPlay(matchBoard);

    expect(await screen.findByText("Opponent finished first")).toBeInTheDocument();
    expect(screen.getByText(/grace won this race/)).toBeInTheDocument();
  });

  it("sends the player back to the lobby rather than to a solo board", async () => {
    getMatch.mockResolvedValue(finishedBy(opponent));

    renderPlay(matchBoard);

    expect(await screen.findByRole("link", { name: "Race again" })).toHaveAttribute(
      "href",
      "/sudoku/multiplayer",
    );
  });

  it("stays out of the way while the race is still running", async () => {
    renderPlay(matchBoard);

    // The race panel is proof the match loaded — so the absence below is a decision, not a race.
    await screen.findByRole("region", { name: "Race progress" });
    expect(lossOverlay()).not.toBeInTheDocument();
  });

  // Both halves of the check matter: finished alone is not a loss.
  it("does not declare a loss to the player who won", async () => {
    getMatch.mockResolvedValue(finishedBy(me));

    renderPlay(matchBoard);

    await screen.findByRole("region", { name: "Race progress" });
    expect(lossOverlay()).not.toBeInTheDocument();
  });

  it("never appears on a solo board, which has no race to lose", async () => {
    renderPlay({ ...matchBoard, solution: SOLUTION, matchId: null });

    expect(await screen.findByRole("button", { name: /Pause/ })).toBeInTheDocument();
    expect(getMatch).not.toHaveBeenCalled();
    expect(lossOverlay()).not.toBeInTheDocument();
  });

  // The loser is told regardless of what their own board is doing — finishing second is still
  // losing, and the board's own completion is not the news.
  it("still tells a player who went on to finish their board", async () => {
    getMatch.mockResolvedValue(finishedBy(opponent));

    renderPlay({ ...matchBoard, status: "completed", completedAt: "2026-07-21T00:05:00Z" });

    expect(await screen.findByText("Opponent finished first")).toBeInTheDocument();
    expect(solvedOverlay()).not.toBeInTheDocument();
  });
});

/**
 * The winner's side of the same moment: their board completes *and* the race ends, so two outcomes
 * land together and only one may be on screen.
 */
describe("the race win overlay", () => {
  const winnerBoard: BoardResponse = {
    ...matchBoard,
    status: "completed",
    completedAt: "2026-07-21T00:04:00Z",
  };

  it("names the beaten opponent and offers a rematch", async () => {
    getMatch.mockResolvedValue(finishedBy(me));

    renderPlay(winnerBoard);

    expect(await screen.findByText("You won this race")).toBeInTheDocument();
    expect(screen.getByText(/grace lost this race/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Race again" })).toHaveAttribute(
      "href",
      "/sudoku/multiplayer",
    );
  });

  /**
   * The overlays are `absolute inset-0` siblings with no z-index between them, so two matching
   * conditions means two stacked backdrops and the later one silently takes the screen. The winner
   * gets exactly one outcome, and it is the race's.
   */
  it("is the only overlay the winner sees", async () => {
    getMatch.mockResolvedValue(finishedBy(me));

    renderPlay(winnerBoard);

    await screen.findByText("You won this race");
    expect(solvedOverlay()).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New game" })).not.toBeInTheDocument();
  });

  // A forfeit hands over the win with nothing solved, so the win cannot wait on the board.
  it("appears for a win by forfeit, with the board still in progress", async () => {
    getMatch.mockResolvedValue(finishedBy(me));

    renderPlay(matchBoard);

    expect(await screen.findByText("You won this race")).toBeInTheDocument();
  });

  it("leaves solo completion alone", async () => {
    renderPlay({ ...winnerBoard, solution: SOLUTION, matchId: null });

    expect(await screen.findByText("Solved")).toBeInTheDocument();
    expect(screen.queryByText("You won this race")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New game" })).toHaveAttribute("href", "/");
  });
});

/**
 * A race whose result will never arrive. Suppressing "Solved" on a match board is right only while
 * a result is still coming — when none is, the board's own outcome is all there is to show, and
 * withholding it leaves a solved grid frozen under nothing at all.
 */
describe("a race that never reports", () => {
  const completedBoard: BoardResponse = {
    ...matchBoard,
    status: "completed",
    completedAt: "2026-07-21T00:04:00Z",
  };

  // The offline case, and the one that matters: a claimed board plays without the network, so the
  // player can finish a race board while every poll is failing.
  it("falls back to the board's own outcome when the match cannot be read", async () => {
    getMatch.mockRejectedValue(new NetworkError());

    renderPlay(completedBoard);

    expect(await screen.findByText("Solved")).toBeInTheDocument();
  });

  it("does the same for a match that no longer exists", async () => {
    getMatch.mockRejectedValue(new ApiError(404, "Match not found"));

    renderPlay(completedBoard);

    expect(await screen.findByText("Solved")).toBeInTheDocument();
  });

  it("does the same for an abandoned race, which has no winner to name", async () => {
    getMatch.mockResolvedValue({ ...activeMatch, status: "abandoned" });

    renderPlay(completedBoard);

    expect(await screen.findByText("Solved")).toBeInTheDocument();
    expect(lossOverlay()).not.toBeInTheDocument();
  });

  // The distinction the fallback turns on: "still running" is not "will never report". A winner is
  // done a poll before they are won, and flashing a solo "New game" into that gap is the bug.
  it("shows nothing in the beat between finishing and the result landing", async () => {
    getMatch.mockResolvedValue(activeMatch);

    renderPlay(completedBoard);

    await screen.findByRole("region", { name: "Race progress" });
    expect(solvedOverlay()).not.toBeInTheDocument();
    expect(lossOverlay()).not.toBeInTheDocument();
  });
});
