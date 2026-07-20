import { useQuery } from "@tanstack/react-query";
import * as api from "../api/client";

/** How often a live race is re-read. See the note in {@link useMatch} for why this number. */
const POLL_MS = 2000;

/**
 * Follows a race.
 *
 * Polling, not a socket, and that is a deliberate choice rather than a placeholder: the API sits
 * behind an API Gateway HTTP API, which carries neither WebSocket upgrades nor responses held open
 * long enough for SSE. Pushing would mean new infrastructure to move one integer per player.
 *
 * Two seconds is picked to sit just under the board's own 2s autosave debounce, so the opponent's
 * bar lags their typing by about one save cycle. The thing players actually care about being
 * instant — someone finishing — does not wait for this: a completing save is flushed immediately
 * and the response says who won.
 *
 * Polling stops once the match reaches a terminal state, so a finished race doesn't sit there
 * making requests forever.
 */
export function useMatch(matchId: number | null) {
  return useQuery({
    queryKey: ["match", matchId],
    // `enabled` keeps this from running while the id is null.
    queryFn: () => api.getMatch(matchId ?? 0),
    enabled: matchId !== null,
    refetchInterval: (query) => {
      const match = query.state.data;
      if (!match) return POLL_MS;
      return match.status === "waiting" || match.status === "active" ? POLL_MS : false;
    },
    // The opponent's progress is only interesting while the tab is in front of someone.
    refetchIntervalInBackground: false,
  });
}
