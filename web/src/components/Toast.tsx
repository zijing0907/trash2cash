import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { type ShowToast, type ToastAction, ToastContext } from "../lib/toast";

import { DrawnCheck } from "./DrawnCheck";

interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const show = useCallback<ShowToast>(
    (message, options) => {
      const id = next.current++;
      setToasts((all) => [...all.slice(-2), { id, message, action: options?.action }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), options?.ms ?? (options?.action ? 6000 : 3500)),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <DrawnCheck />
            <span className="toast__text">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <X size={16} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
