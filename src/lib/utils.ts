import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Shared styling for a trailing "Actions" column pinned to the right edge
// of a horizontally scrollable admin table — so the action buttons stay
// reachable without scrolling all the way over, instead of just clipping
// off-screen with no obvious way back to them. bg-background keeps
// scrolled-under content from showing through; group-hover mirrors
// TableRow's own hover tint (see table.tsx) since the sticky cell sits
// outside the row's normal background.
export const STICKY_ACTIONS_HEAD_CLASS =
  "sticky right-0 border-l bg-background text-right group-hover:bg-muted/50";
export const STICKY_ACTIONS_CELL_CLASS =
  "sticky right-0 border-l bg-background text-right group-hover:bg-muted/50";
