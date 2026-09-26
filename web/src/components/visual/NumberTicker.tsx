"use client";

import React, { useEffect, useState, useRef } from "react";

interface NumberTickerProps {
  value: number;
  direction?: "up" | "down";
  className?: string;
  delay?: number;
  decimalPlaces?: number;
  prefix?: string;
  suffix?: string;
}

export function NumberTicker({
  value,
  direction = "up",
  className = "",
  delay = 0,
  decimalPlaces = 0,
  prefix = "",
  suffix = "",
}: NumberTickerProps) {
  const [displayValue, setDisplayValue] = useState<number>(direction === "down" ? value : 0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let animationFrameId: number;
    const duration = 1200; // ms

    const startTimeout = setTimeout(() => {
      const startVal = direction === "down" ? value : 0;
      const endVal = direction === "down" ? 0 : value;

      const step = (timestamp: number) => {
        if (!startTimeRef.current) startTimeRef.current = timestamp;
        const progress = Math.min((timestamp - startTimeRef.current) / duration, 1);
        // Ease out expo
        const easeOut = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        const current = startVal + (endVal - startVal) * easeOut;
        setDisplayValue(current);

        if (progress < 1) {
          animationFrameId = requestAnimationFrame(step);
        } else {
          setDisplayValue(endVal);
        }
      };

      animationFrameId = requestAnimationFrame(step);
    }, delay * 1000);

    return () => {
      clearTimeout(startTimeout);
      cancelAnimationFrame(animationFrameId);
    };
  }, [value, direction, delay]);

  const formatted = displayValue.toLocaleString(undefined, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });

  return (
    <span className={`tabular-nums font-mono ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
