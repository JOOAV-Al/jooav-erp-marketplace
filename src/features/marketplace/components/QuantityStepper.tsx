"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Matches the product page's minimum order quantity rule. */
const MIN_QUANTITY = 10;
const COMMIT_DELAY_MS = 500;

interface QuantityStepperProps {
  quantity: number;
  onCommit: (quantity: number) => void;
  min?: number;
  className?: string;
}

/**
 * Compact -/+ stepper for cart quantities.
 *
 * Local state keeps clicks instant; the API commit is debounced so a burst of
 * clicks coalesces into a single request instead of racing itself. The server
 * value stays the source of truth: when `quantity` changes (settle or
 * rollback) the display re-syncs, reverting the UI if the request failed —
 * except when the incoming value is the echo of our own last commit while a
 * newer step is still waiting to be sent, in which case the newer intent is
 * kept instead of being stomped by the older value.
 */
export default function QuantityStepper({
  quantity,
  onCommit,
  min = MIN_QUANTITY,
  className,
}: QuantityStepperProps) {
  const [value, setValue] = useState(quantity);
  const [syncedQuantity, setSyncedQuantity] = useState(quantity);
  // Last value handed to onCommit; the render-phase check below compares
  // incoming server values against it to spot its own echo.
  const [lastSent, setLastSent] = useState(quantity);
  const lastSentRef = useRef(quantity);
  const pendingRef = useRef<number | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  // Adopt the server value whenever it changes (settle or rollback). Adjusting
  // state during render (React docs, "adjusting state when a prop changes")
  // resets the display in the same pass. The one exception: an echo of our own
  // last commit — the settle of an older value must not pull back a newer
  // local step that has not been sent yet.
  if (syncedQuantity !== quantity) {
    setSyncedQuantity(quantity);
    if (quantity !== lastSent) {
      setValue(quantity);
    }
  }

  // Mirror an adopted server value into the debounce guard and drop the burst
  // it just made stale (refs only: a state update here would fight the
  // render-phase adoption above). An echo of our own commit keeps the burst.
  useEffect(() => {
    if (quantity === lastSentRef.current) return;
    lastSentRef.current = quantity;
    pendingRef.current = null;
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }, [quantity]);

  // On unmount (drawer closed mid-burst), flush the pending commit instead of
  // silently dropping the last click.
  useEffect(
    () => () => {
      if (!commitTimerRef.current) return;
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending !== null && pending !== lastSentRef.current) {
        lastSentRef.current = pending;
        onCommitRef.current(pending);
      }
    },
    [],
  );

  const commit = (next: number) => {
    if (next === lastSentRef.current) return;
    lastSentRef.current = next;
    setLastSent(next);
    onCommitRef.current(next);
  };

  const step = (delta: number) => {
    const next = Math.max(min, value + delta);
    if (next === value) return;

    setValue(next);
    pendingRef.current = next;
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending !== null) commit(pending);
    }, COMMIT_DELAY_MS);
  };

  return (
    <span className={cn("inline-flex items-center gap-[6px]", className)}>
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className="grid h-[22px] w-[22px] place-items-center rounded-md border border-border-main text-outline-passive transition-colors hover:text-heading disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus size={12} strokeWidth={2.5} />
      </button>

      <span className="min-w-[2ch] text-center text-body font-garantpro font-semibold text-[13px] tracking-[0.05em]">
        {value}
      </span>

      <button
        type="button"
        onClick={() => step(1)}
        aria-label="Increase quantity"
        className="grid h-[22px] w-[22px] place-items-center rounded-md border border-border-main text-outline-passive transition-colors hover:text-heading"
      >
        <Plus size={12} strokeWidth={2.5} />
      </button>
    </span>
  );
}
