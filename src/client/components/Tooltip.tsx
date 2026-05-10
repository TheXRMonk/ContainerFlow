import { useState } from "react";
import { HelpCircle } from "lucide-react";

interface TooltipProps {
  text: string;
  /** Width of the tooltip popover. Default: w-56 */
  width?: string;
  /** Icon size. Default: 13 */
  size?: number;
  /** Where the popover opens relative to the icon. Default: "top" */
  placement?: "top" | "bottom";
}

export function Tooltip({ text, width = "w-56", size = 13, placement = "top" }: TooltipProps) {
  const [show, setShow] = useState(false);
  const popoverPos =
    placement === "top"
      ? "bottom-full mb-2"
      : "top-full mt-2";
  const arrowPos =
    placement === "top"
      ? "top-full -mt-px border-t-slate-700"
      : "bottom-full -mb-px border-b-slate-700";
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={(e) => { e.stopPropagation(); setShow((v) => !v); }}
        className="text-slate-500 hover:text-slate-300 transition-colors"
      >
        <HelpCircle size={size} />
      </button>
      {show && (
        <div className={`absolute ${popoverPos} left-1/2 -translate-x-1/2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-xs text-slate-200 ${width} text-left shadow-xl z-50 leading-relaxed whitespace-normal`}>
          {text}
          <div className={`absolute ${arrowPos} left-1/2 -translate-x-1/2 border-4 border-transparent`} />
        </div>
      )}
    </span>
  );
}
