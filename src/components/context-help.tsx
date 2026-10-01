"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { helpPosition } from "@lib/help-position";

/** Non-action help only. Children must not contain links or other controls. */
export default function ContextHelp({ title, description, label, className = "", children }: {
  title: string;
  description: string;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  const pinned = useRef(false);
  const overPanel = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);

  function cancelClose() {
    clearTimeout(closeTimer.current);
  }

  function position() {
    if (!trigger.current || !panel.current?.matches(":popover-open")) return;
    const anchor = trigger.current.getBoundingClientRect();
    const bounds = panel.current.getBoundingClientRect();
    const next = helpPosition(anchor, bounds, { width: document.documentElement.clientWidth, height: window.innerHeight });
    panel.current.style.left = `${next.left}px`;
    panel.current.style.top = `${next.top}px`;
  }

  function show() {
    cancelClose();
    if (!panel.current?.showPopover) return;
    if (!panel.current.matches(":popover-open")) panel.current.showPopover();
    position();
  }

  function hide() {
    cancelClose();
    pinned.current = false;
    if (panel.current?.matches(":popover-open")) panel.current.hidePopover();
  }

  function leave() {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      const keyboardFocus = document.activeElement === trigger.current && trigger.current?.matches(":focus-visible");
      if (!pinned.current && !keyboardFocus) hide();
    }, 180);
  }

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!open) return;
    // Keep the help beside its trigger without leaving detached bubbles on scroll.
    function reposition() {
      if (!trigger.current || !panel.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      if (anchor.bottom < 0 || anchor.top > window.innerHeight) {
        panel.current.hidePopover();
        return;
      }
      const bounds = panel.current.getBoundingClientRect();
      const next = helpPosition(anchor, bounds, { width: document.documentElement.clientWidth, height: window.innerHeight });
      panel.current.style.left = `${next.left}px`;
      panel.current.style.top = `${next.top}px`;
    }
    function dismissOnTab(event: KeyboardEvent) {
      if (event.key === "Tab" && panel.current?.matches(":popover-open")) panel.current.hidePopover();
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("keydown", dismissOnTab);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("keydown", dismissOnTab);
    };
  }, [open]);

  return <>
    <button
      ref={trigger}
      type="button"
      popoverTarget={id}
      aria-label={label}
      aria-describedby={id}
      aria-expanded={open}
      className={`context-help-trigger min-h-6 min-w-6 cursor-help rounded-sm ${className}`}
      onPointerEnter={event => { if (event.pointerType !== "touch") show(); }}
      onPointerLeave={leave}
      onFocus={event => { if (event.currentTarget.matches(":focus-visible")) show(); }}
      onBlur={() => { if (!overPanel.current) hide(); }}
      onKeyDown={event => { if (event.key === "Tab") hide(); }}
      onClick={event => {
        event.preventDefault();
        if (pinned.current && panel.current?.matches(":popover-open")) hide();
        else { pinned.current = true; show(); }
      }}
    >{children}</button>
    <span
      ref={panel}
      id={id}
      popover="auto"
      role="tooltip"
      className="context-help-panel"
      onPointerEnter={() => { overPanel.current = true; cancelClose(); }}
      onPointerLeave={() => { overPanel.current = false; leave(); }}
      onToggle={event => {
        const visible = event.newState === "open";
        setOpen(visible);
        if (!visible) { pinned.current = false; overPanel.current = false; cancelClose(); }
      }}
    >
      <span className="block text-sm font-semibold text-text">{title}</span>
      <span className="mt-2 block text-sm font-normal leading-6 text-text-soft">{description}</span>
    </span>
  </>;
}
