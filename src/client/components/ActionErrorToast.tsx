import { useState } from "react";
import { AlertCircle, X, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import type { ActionError } from "../../shared/types";
import { useT } from "../i18n";

const PREVIEW_CHAR_LIMIT = 180;

function ToastItem({ err, onDismiss }: { err: ActionError; onDismiss: (id: string) => void }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const shortName = err.uid.split("/").pop() || err.uid;
  const project = err.uid.includes("/") ? err.uid.split("/")[0] : null;
  const isLong = err.error.length > PREVIEW_CHAR_LIMIT;
  const visibleError = expanded || !isLong ? err.error : err.error.slice(0, PREVIEW_CHAR_LIMIT) + "…";

  const copy = async () => {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(err.error);
        ok = true;
      } else {
        const ta = document.createElement("textarea");
        ta.value = err.error;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      }
    } catch {}
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="bg-slate-800/95 backdrop-blur-sm border border-red-500/40 rounded-lg shadow-xl shadow-black/50 w-[380px] overflow-hidden">
      <div className="flex items-start gap-2.5 px-3.5 py-2.5 border-b border-red-500/20 bg-red-500/10">
        <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-red-300 capitalize">
            {t("toast.actionFailed").replace("{action}", err.action)}
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xs text-slate-200 font-medium truncate">{shortName}</span>
            {project && <span className="text-[10px] text-slate-500 truncate">{project}</span>}
          </div>
        </div>
        <button
          onClick={() => onDismiss(err.id)}
          className="p-1 rounded hover:bg-slate-700/60 text-slate-500 hover:text-slate-300 transition-colors shrink-0"
          title={t("toast.dismiss")}
        >
          <X size={14} />
        </button>
      </div>
      <div className="px-3.5 py-2.5">
        <pre className="text-[11px] text-slate-300 font-mono whitespace-pre-wrap break-words leading-snug max-h-48 overflow-auto">
          {visibleError}
        </pre>
        <div className="flex items-center justify-end gap-1 mt-2">
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 rounded transition-colors"
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? t("toast.collapse") : t("toast.expand")}
            </button>
          )}
          <button
            onClick={copy}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 rounded transition-colors"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            {copied ? t("toast.copied") : t("toast.copy")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ActionErrorToastProps {
  errors: ActionError[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

export function ActionErrorToast({ errors, onDismiss, onClearAll }: ActionErrorToastProps) {
  const { t } = useT();
  if (errors.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2">
      {errors.length > 1 && (
        <button
          onClick={onClearAll}
          className="self-end text-[10px] text-slate-500 hover:text-slate-300 underline transition-colors"
        >
          {t("toast.dismissAll")} ({errors.length})
        </button>
      )}
      {errors.map((err) => (
        <ToastItem key={err.id} err={err} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
