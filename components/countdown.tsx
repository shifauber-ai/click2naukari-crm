"use client";

import { useState, useEffect } from "react";

interface CountdownProps {
  target: string;
  className?: string;
}

export function Countdown({ target, className }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const targetMs = new Date(target).getTime();
  const diff = targetMs - now;

  if (diff <= 0) {
    return (
      <span className={"text-destructive font-medium " + (className || "")}>
        Overdue
      </span>
    );
  }

  const seconds = Math.floor(diff / 1000) % 60;
  const minutes = Math.floor(diff / 60000) % 60;
  const hours = Math.floor(diff / 3600000) % 24;
  const days = Math.floor(diff / 86400000);

  let display: string;
  if (days > 0) {
    display = `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    display = `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    display = `${minutes}m ${seconds}s`;
  } else {
    display = `${seconds}s`;
  }

  const isUrgent = diff < 3600000; // < 1 hour
  return (
    <span
      className={
        (isUrgent ? "text-warning-foreground font-medium" : "text-muted-foreground") +
        " " +
        (className || "")
      }
    >
      {display}
    </span>
  );
}
