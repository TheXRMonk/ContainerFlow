import { useEffect, useRef } from "react";
import { RotateCw, Square, Play, Trash2, Terminal, ExternalLink, Hammer } from "lucide-react";
import type { Service } from "../../shared/types";
import { useT } from "../i18n";

interface NodeContextMenuProps {
  position: { x: number; y: number };
  service: Service;
  onAction: (action: "start" | "stop" | "restart" | "remove" | "rebuild") => void;
  onOpenLogs: () => void;
  onClose: () => void;
}

export function NodeContextMenu({ position, service, onAction, onOpenLogs, onClose }: NodeContextMenuProps) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    };
    const scrollHandler = () => onClose();
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("scroll", scrollHandler, true);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("scroll", scrollHandler, true);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  // Adjust position so menu doesn't overflow viewport
  const menuWidth = 180;
  const menuHeight = 200;
  const x = position.x + menuWidth > window.innerWidth ? position.x - menuWidth : position.x;
  const y = position.y + menuHeight > window.innerHeight - 50 ? position.y - menuHeight : position.y;

  const isRunning = service.state === "running";
  const firstPort = service.ports.length > 0 ? service.ports[0] : null;

  return (
    <div
      ref={ref}
      className="fixed z-[10000] bg-slate-800 border border-slate-700 rounded-lg shadow-xl shadow-black/50 py-1.5 min-w-[180px]"
      style={{ left: x, top: y }}
    >
      {isRunning ? (
        <>
          <MenuItem icon={RotateCw} label={t("actions.restart")} color="text-yellow-400" onClick={() => { onAction("restart"); onClose(); }} />
          <MenuItem icon={Square} label={t("actions.stop")} color="text-red-400" onClick={() => { onAction("stop"); onClose(); }} />
        </>
      ) : (
        <>
          <MenuItem icon={Play} label={t("actions.start")} color="text-emerald-400" onClick={() => { onAction("start"); onClose(); }} />
          <MenuItem icon={Trash2} label={t("actions.remove")} color="text-red-400" onClick={() => { onAction("remove"); onClose(); }} />
        </>
      )}
      {service.compose_file && (
        <>
          <div className="border-t border-slate-700/50 my-1" />
          <MenuItem icon={Hammer} label={t("actions.rebuild")} color="text-cyan-400" onClick={() => { onAction("rebuild"); onClose(); }} />
        </>
      )}
      <div className="border-t border-slate-700/50 my-1" />
      <MenuItem icon={Terminal} label={t("actions.openLogs")} color="text-cyan-400" onClick={() => { onOpenLogs(); onClose(); }} />
      {isRunning && firstPort && (
        <a
          href={`http://${window.location.hostname}:${firstPort.host}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-slate-300 hover:bg-slate-700/60 transition-colors cursor-pointer"
          onClick={onClose}
        >
          <ExternalLink size={14} className="text-slate-400" />
          <span>{t("actions.open")} :{firstPort.host}</span>
        </a>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, color, onClick }: { icon: typeof Play; label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-slate-300 hover:bg-slate-700/60 transition-colors"
    >
      <Icon size={14} className={color} />
      <span>{label}</span>
    </button>
  );
}
