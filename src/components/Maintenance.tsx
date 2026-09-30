import { useState, type ReactNode } from "react";

/**
 * The arrival message for a screen whose form is switched off. A disabled form explains nothing on
 * its own, and every path into the account screens — sign in, sign up, reset — is down together, so
 * the copy covers all three rather than being per-screen.
 *
 * Dismissible: the rest of the page is still worth reading, and every screen that renders this also
 * keeps a {@link MaintenanceBanner} in its form, so the message survives the dismissal.
 */
export function MaintenanceDialog({ until }: { until: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="maintenance-title"
      aria-describedby="maintenance-body"
      className="fixed inset-0 z-10 grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-6">
        <h2 id="maintenance-title" className="mb-2 text-lg font-semibold">
          Down for maintenance
        </h2>
        <p id="maintenance-body" className="mb-6 text-sm leading-relaxed text-slate-300">
          We&apos;re doing some work on Cortex Clash, so signing in, creating an account and
          resetting a password are all switched off for now. We expect to be back up by {until}.
          Thanks for your patience.
        </p>
        <button
          type="button"
          autoFocus
          onClick={() => setOpen(false)}
          className="btn-primary w-full"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/**
 * Stays in the form after the dialog is dismissed, so a dead form is never on screen with nothing
 * explaining it. `children` names what this particular screen cannot do; the date is shared.
 */
export function MaintenanceBanner({ until, children }: { until: string; children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
    >
      {children} We expect to be back on {until}.
    </p>
  );
}
