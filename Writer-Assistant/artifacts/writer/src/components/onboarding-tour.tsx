import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface TourStep {
  target: string;
  title: string;
  description: string;
  placement?: "top" | "bottom" | "left" | "right" | "auto";
}

interface OnboardingTourProps {
  steps: TourStep[];
  tourKey: string;
  onComplete?: () => void;
}

const STORAGE_PREFIX = "wa-tour-seen-";

function getScrollParent(el: Element): Element {
  let parent = el.parentElement;
  while (parent) {
    const overflow = window.getComputedStyle(parent).overflowY;
    if (overflow === "auto" || overflow === "scroll") return parent;
    parent = parent.parentElement;
  }
  return document.documentElement;
}

function scrollIntoViewIfNeeded(el: Element) {
  const rect = el.getBoundingClientRect();
  const margin = 120;
  if (rect.top < margin || rect.bottom > window.innerHeight - margin) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function computeTooltipStyle(
  targetRect: DOMRect,
  placement: string,
  tooltipW: number,
  tooltipH: number
) {
  const gap = 16;
  const margin = 12;

  let left = targetRect.left + targetRect.width / 2 - tooltipW / 2;
  let top = targetRect.bottom + gap;

  if (placement === "top") {
    top = targetRect.top - tooltipH - gap;
  } else if (placement === "left") {
    left = targetRect.left - tooltipW - gap;
    top = targetRect.top + targetRect.height / 2 - tooltipH / 2;
  } else if (placement === "right") {
    left = targetRect.right + gap;
    top = targetRect.top + targetRect.height / 2 - tooltipH / 2;
  } else if (placement === "bottom" || placement === "auto") {
    top = targetRect.bottom + gap;
    if (top + tooltipH > window.innerHeight - margin) {
      top = targetRect.top - tooltipH - gap;
    }
  }

  if (placement === "auto") {
    if (left < margin) left = margin;
    if (left + tooltipW > window.innerWidth - margin) left = window.innerWidth - tooltipW - margin;
    if (top < margin) top = margin;
    if (top + tooltipH > window.innerHeight - margin) top = window.innerHeight - tooltipH - margin;
  }

  left = Math.max(margin, Math.min(left, window.innerWidth - tooltipW - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - tooltipH - margin));

  return { left, top };
}

export default function OnboardingTour({ steps, tourKey, onComplete }: OnboardingTourProps) {
  const storageKey = `${STORAGE_PREFIX}${tourKey}`;
  const [seen, setSeen] = useState(() => localStorage.getItem(storageKey) === "1");
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const step = steps[currentStep];

  const finish = useCallback(() => {
    localStorage.setItem(storageKey, "1");
    setSeen(true);
    setVisible(false);
    onComplete?.();
  }, [storageKey, onComplete]);

  const updatePositions = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTargetRect(rect);

    const tooltipW = tooltipRef.current?.offsetWidth || 320;
    const tooltipH = tooltipRef.current?.offsetHeight || 160;
    const placement = step.placement || "auto";
    setTooltipPos(computeTooltipStyle(rect, placement, tooltipW, tooltipH));
  }, [step]);

  useEffect(() => {
    if (seen) return;
    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, [seen]);

  useEffect(() => {
    if (!visible) return;
    const el = document.querySelector(step?.target ?? "");
    if (el) scrollIntoViewIfNeeded(el);
    const t = setTimeout(updatePositions, 400);
    window.addEventListener("scroll", updatePositions, { passive: true });
    window.addEventListener("resize", updatePositions);
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", updatePositions);
      window.removeEventListener("resize", updatePositions);
    };
  }, [visible, currentStep, updatePositions]);

  useEffect(() => {
    if (!visible) return;
    const el = document.querySelector(step?.target ?? "");
    if (!el) return;
    const observer = new MutationObserver(updatePositions);
    observer.observe(el, { attributes: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, [visible, currentStep, step, updatePositions]);

  const goNext = () => {
    if (currentStep < steps.length - 1) setCurrentStep((s) => s + 1);
    else finish();
  };

  const goPrev = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  if (seen || !visible || !targetRect || !tooltipPos || !step) return null;

  const spotlightStyle = {
    clipPath: `polygon(
      0% 0%, 0% 100%,
      ${targetRect.left - 8}px 100%,
      ${targetRect.left - 8}px ${targetRect.top - 8}px,
      ${targetRect.right + 8}px ${targetRect.top - 8}px,
      ${targetRect.right + 8}px ${targetRect.bottom + 8}px,
      ${targetRect.left - 8}px ${targetRect.bottom + 8}px,
      ${targetRect.left - 8}px 100%,
      100% 100%, 100% 0%
    )`,
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] font-sans" style={{ pointerEvents: "none" }}>
      {/* Dark overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[1px] transition-all duration-500 ease-out"
        style={spotlightStyle}
      />

      {/* Highlight ring around target */}
      <div
        className="absolute rounded-lg ring-2 ring-white/60 ring-offset-2 ring-offset-transparent pointer-events-none transition-all duration-400 ease-out"
        style={{
          left: targetRect.left - 8,
          top: targetRect.top - 8,
          width: targetRect.width + 16,
          height: targetRect.height + 16,
        }}
      />

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="absolute pointer-events-auto bg-card border rounded-xl shadow-2xl p-5 w-[340px] max-w-[calc(100vw-24px)] transition-all duration-400 ease-out"
        style={{ left: tooltipPos.left, top: tooltipPos.top }}
      >
        {/* Step dots */}
        <div className="flex items-center gap-1.5 mb-3">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentStep ? "w-6 bg-primary" : i < currentStep ? "w-1.5 bg-primary/40" : "w-1.5 bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>

        {/* Title */}
        <h3 className="font-serif text-lg font-semibold text-foreground mb-1.5">{step.title}</h3>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.description}</p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={finish}
            className="text-xs text-muted-foreground hover:text-foreground h-8 px-2"
          >
            <X className="w-3.5 h-3.5 mr-1" /> Skip
          </Button>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={goPrev}
              disabled={currentStep === 0}
              className="h-7 w-7 rounded-full"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>

            <Button
              size="sm"
              onClick={goNext}
              className="h-7 gap-1 px-3 text-xs rounded-full"
            >
              {currentStep === steps.length - 1 ? (
                <>Done</>
              ) : (
                <>Next <ChevronRight className="w-3.5 h-3.5" /></>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
