/**
 * Planned downtime. While this returns a notice the login screen switches its form off and says so
 * up front, instead of letting the player type credentials into a form whose submit can only fail.
 *
 * Deliberately a hand-flipped constant rather than a clock check: the date below is when we *expect*
 * to be back, not a guarantee, and turning sign-in on before the backend actually answers would swap
 * an honest "we're down" for a wrong password error. Return `null` to put the form back.
 */
export interface MaintenanceNotice {
  /** When service is expected back, spelled the way the copy should read it. */
  until: string;
}

export function maintenanceNotice(): MaintenanceNotice | null {
  return { until: "October 5" };
}
