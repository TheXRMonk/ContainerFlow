import { useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";

interface TooltipProps {
  text: string;
  /** Width of the tooltip popover. Default: w-56 */
  width?: string;
  /** Icon size. Default: 13 */
  size?: number;
  /** Where the popover opens relative to the icon. Default: "top" */
  placement?: "top" | "bottom" | "right";
  /** Keep text on a single line (no wrapping). Width grows to fit content. */
  nowrap?: boolean;
}

const GAP = 8; // px between icon and popover

export function Tooltip({ text, width = "w-56", size = 13, placement = "top", nowrap = false }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; arrowLeft: number; arrowTop: number; flippedTo: "top" | "bottom" | "right" } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!show || !btnRef.current) return;

    const compute = () => {
      const btn = btnRef.current;
      const pop = popRef.current;
      if (!btn || !pop) return;
      const btnRect = btn.getBoundingClientRect();
      const popRect = pop.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const btnCenterX = btnRect.left + btnRect.width / 2;
      const btnCenterY = btnRect.top + btnRect.height / 2;

      let left: number;
      let top: number;
      let arrowLeft = 0;
      let arrowTop = 0;
      let actual: "top" | "bottom" | "right" = placement;

      if (placement === "right") {
        // Popover to the right of icon, vertically centered
        left = btnRect.right + GAP;
        top = btnCenterY - popRect.height / 2;
        // Flip to left/bottom if no room to the right
        if (left + popRect.width + 8 > vw) {
          // fallback to bottom
          actual = "bottom";
          left = Math.max(8, Math.min(btnCenterX - popRect.width / 2, vw - popRect.width - 8));
          top = btnRect.bottom + GAP;
          arrowLeft = btnCenterX - left;
        } else {
          top = Math.max(8, Math.min(top, vh - popRect.height - 8));
          arrowTop = btnCenterY - top;
        }
      } else {
        // Center horizontally on icon, clamp to viewport
        left = btnCenterX - popRect.width / 2;
        left = Math.max(8, Math.min(left, vw - popRect.width - 8));
        arrowLeft = btnCenterX - left;

        if (placement === "top") {
          const candidateTop = btnRect.top - popRect.height - GAP;
          if (candidateTop < 8 && btnRect.bottom + popRect.height + GAP < vh) {
            actual = "bottom";
            top = btnRect.bottom + GAP;
          } else {
            top = candidateTop;
          }
        } else {
          // bottom
          const candidateTop = btnRect.bottom + GAP;
          if (candidateTop + popRect.height + 8 > vh && btnRect.top - popRect.height - GAP > 0) {
            actual = "top";
            top = btnRect.top - popRect.height - GAP;
          } else {
            top = candidateTop;
          }
        }
      }

      setPos({ left, top, arrowLeft, arrowTop, flippedTo: actual });
    };

    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [show, placement]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={(e) => { e.stopPropagation(); setShow((v) => !v); }}
        className="text-slate-500 hover:text-slate-300 transition-colors inline-flex items-center"
      >
        <HelpCircle size={size} />
      </button>
      {show && createPortal(
        <div
          ref={popRef}
          style={{
            position: "fixed",
            left: pos?.left ?? -9999,
            top: pos?.top ?? -9999,
            visibility: pos ? "visible" : "hidden",
            zIndex: 99999,
          }}
          className={`px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-xs text-slate-200 ${nowrap ? "whitespace-nowrap" : `${width} whitespace-pre-line`} text-left shadow-xl leading-relaxed`}
        >
          {text}
          {pos && pos.flippedTo === "right" && (
            <div
              className="absolute right-full border-4 border-transparent border-r-slate-700"
              style={{ top: pos.arrowTop - 4 }}
            />
          )}
          {pos && pos.flippedTo === "top" && (
            <div
              className="absolute top-full border-4 border-transparent border-t-slate-700"
              style={{ left: pos.arrowLeft - 4 }}
            />
          )}
          {pos && pos.flippedTo === "bottom" && (
            <div
              className="absolute bottom-full border-4 border-transparent border-b-slate-700"
              style={{ left: pos.arrowLeft - 4 }}
            />
          )}
        </div>,
        document.body
      )}
    </>
  );
}
