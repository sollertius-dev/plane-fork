/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@plane/utils";

type Props = {
  value: string; // raw value shown in the input
  display: ReactNode; // what is shown when not editing
  type?: "text" | "number" | "date";
  readOnly?: boolean;
  autoEdit?: boolean; // open straight away (used for a row that was just added)
  align?: "left" | "right";
  className?: string;
  title?: string; // shown on hover, for text that is cut
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: string) => void;
};

export function EditableCell({
  value,
  display,
  type = "text",
  readOnly,
  autoEdit,
  align = "left",
  className,
  title,
  min,
  max,
  step,
  onCommit,
}: Props) {
  const [editing, setEditing] = useState(!!autoEdit && !readOnly);
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);

  const open = () => {
    if (readOnly) return;
    setDraft(value);
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  };

  if (editing) {
    return (
      <input
        ref={input}
        type={type}
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className={cn(
          "h-7 w-full min-w-0 rounded-sm border border-accent-strong bg-surface-1 px-1.5 text-[13px] text-primary outline-none",
          align === "right" && "text-right",
          className
        )}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      disabled={readOnly}
      title={title}
      className={cn(
        "h-7 w-full min-w-0 truncate rounded-sm px-1.5 text-[13px]",
        align === "right" ? "text-right" : "text-left",
        readOnly ? "cursor-default" : "hover:bg-layer-1-hover cursor-text",
        className
      )}
    >
      {display}
    </button>
  );
}
