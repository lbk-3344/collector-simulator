"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// In-app replacement for the browser's native confirm()/alert(). Every
// confirmation, warning, error or success acknowledgement goes through this
// instead of a browser dialog — see CHARTE-GRAPHIQUE.md "In-app dialogs".
// A styled modal (reuses .modal-overlay/.modal/.modal-head/.modal-foot) with a
// title bar, a big variant-colored icon on the left, the message on the right,
// and the action buttons in the footer.

export type DialogVariant = "success" | "info" | "warning" | "error";

export interface DialogRequest {
  /** Icon + color. Defaults to "info" (navy). */
  variant?: DialogVariant;
  /** Short reason, shown in the title bar. */
  title: string;
  /** Body copy — a string, or JSX for multi-paragraph messages. */
  message: ReactNode;
  /** Confirm/OK button label. Default: "Confirm" for confirm(), "OK" for alert(). */
  confirmLabel?: string;
  /** Cancel button label (confirm() only). Default: "Cancel". */
  cancelLabel?: string;
  /** Style the confirm button as destructive (red). */
  danger?: boolean;
}

interface DialogContextValue {
  /** Resolves true if confirmed, false if cancelled/dismissed. */
  confirm: (req: DialogRequest) => Promise<boolean>;
  /** Single-button acknowledgement. Resolves once dismissed. */
  alert: (req: DialogRequest) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within <AppDialogProvider>");
  return ctx;
}

type ActiveDialog = DialogRequest & {
  mode: "confirm" | "alert";
  resolve: (confirmed: boolean) => void;
};

function VariantIcon({ variant }: { variant: DialogVariant }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (variant) {
    case "success":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.5l2.5 2.5L16 9" />
        </svg>
      );
    case "warning":
      return (
        <svg {...common}>
          <path d="M12 3.5 21 19H3L12 3.5Z" />
          <path d="M12 9.5v4.5" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "error":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M15 9l-6 6M9 9l6 6" />
        </svg>
      );
    case "info":
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
      );
  }
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveDialog | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    setActive((cur) => {
      cur?.resolve(confirmed);
      return null;
    });
  }, []);

  const confirm = useCallback(
    (req: DialogRequest) =>
      new Promise<boolean>((resolve) => {
        setActive((cur) => {
          cur?.resolve(false); // dismiss any dialog already showing
          return { ...req, mode: "confirm", resolve };
        });
      }),
    []
  );

  const alert = useCallback(
    (req: DialogRequest) =>
      new Promise<void>((resolve) => {
        setActive((cur) => {
          cur?.resolve(false);
          return { ...req, mode: "alert", resolve: () => resolve() };
        });
      }),
    []
  );

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") settle(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, settle]);

  const variant = active?.variant ?? "info";

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {active && (
        <div
          className="modal-overlay dialog-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) settle(false);
          }}
        >
          <div
            className="modal fade-in"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="appDialogTitle"
            aria-describedby="appDialogMessage"
          >
            <div className="modal-head">
              <h2 id="appDialogTitle">{active.title}</h2>
              <button className="modal-close" aria-label="Close" onClick={() => settle(false)}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <line x1="5" y1="5" x2="15" y2="15" />
                  <line x1="15" y1="5" x2="5" y2="15" />
                </svg>
              </button>
            </div>

            <div className="dialog-body">
              <div className={`dialog-icon dialog-icon-${variant}`} aria-hidden="true">
                <VariantIcon variant={variant} />
              </div>
              <div className="dialog-message" id="appDialogMessage">
                {typeof active.message === "string" ? <p>{active.message}</p> : active.message}
              </div>
            </div>

            <div className="modal-foot">
              {active.mode === "confirm" && (
                <button className="btn btn-secondary" onClick={() => settle(false)}>
                  {active.cancelLabel ?? "Cancel"}
                </button>
              )}
              <button
                className={`btn ${active.danger ? "btn-danger" : "btn-primary"}`}
                autoFocus
                onClick={() => settle(true)}
              >
                {active.confirmLabel ?? (active.mode === "confirm" ? "Confirm" : "OK")}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
