/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export function WbsIcon({ className = "size-4 flex-shrink-0" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1.5" y="2" width="5" height="3" rx="0.8" />
      <rect x="8" y="6.5" width="6.5" height="3" rx="0.8" />
      <rect x="8" y="11" width="4" height="3" rx="0.8" />
      <path d="M4 5v7.5M4 8h4M4 12.5h4" />
    </svg>
  );
}
