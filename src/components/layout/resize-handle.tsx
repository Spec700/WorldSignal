"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

interface ResizeHandleProps {
  direction?: 1 | -1;
  label: string;
  max: number;
  min: number;
  onResize: (value: number) => void;
  orientation: "horizontal" | "vertical";
  value: number;
}

interface DragState {
  coordinate: number;
  pointerId: number;
  value: number;
}

const KEYBOARD_STEP = 16;
const LARGE_KEYBOARD_STEP = 48;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

export function ResizeHandle({
  direction = 1,
  label,
  max,
  min,
  onResize,
  orientation,
  value,
}: ResizeHandleProps) {
  const dragState = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const coordinateFor = (event: PointerEvent<HTMLButtonElement>) =>
    orientation === "vertical" ? event.clientX : event.clientY;

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragState.current = {
      coordinate: coordinateFor(event),
      pointerId: event.pointerId,
      value,
    };
    setDragging(true);
  };

  const finishPointerResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragState.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    dragState.current = null;
    setDragging(false);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const delta = (coordinateFor(event) - drag.coordinate) * direction;
    onResize(clamp(drag.value + delta, min, max));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onResize(event.key === "Home" ? min : max);
      return;
    }

    const coordinateDelta =
      orientation === "vertical"
        ? event.key === "ArrowLeft"
          ? -1
          : event.key === "ArrowRight"
            ? 1
            : 0
        : event.key === "ArrowUp"
          ? -1
          : event.key === "ArrowDown"
            ? 1
            : 0;

    if (coordinateDelta === 0) {
      return;
    }

    event.preventDefault();
    const step = event.shiftKey ? LARGE_KEYBOARD_STEP : KEYBOARD_STEP;
    onResize(clamp(value + coordinateDelta * direction * step, min, max));
  };

  return (
    <button
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      aria-valuetext={`${value} pixels`}
      className={`resize-handle resize-handle--${orientation}${dragging ? " is-dragging" : ""}`}
      onKeyDown={handleKeyDown}
      onLostPointerCapture={() => {
        dragState.current = null;
        setDragging(false);
      }}
      onPointerCancel={finishPointerResize}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerResize}
      role="separator"
      title={`${label} — drag or use arrow keys`}
      type="button"
    />
  );
}
