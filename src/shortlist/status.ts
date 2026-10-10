import { Archive, CalendarCheck, Circle, CircleCheck, CircleDashed, Hourglass, Send, type LucideIcon } from "lucide-react";
import type { Status } from "./store";

export const STATUS_LABEL: Record<Status, string> = {
  maybe: "Maybe",
  toContact: "To contact",
  contacted: "Contacted",
  waiting: "Waiting list",
  consultation: "Consultation",
  seeing: "Seeing them",
  setAside: "Set aside",
};

/** "To contact" is an empty circle rather than the bookmark, whose outline means "not yet shortlisted" beside it. */
export const STATUS_ICON: Record<Status, LucideIcon> = {
  maybe: CircleDashed,
  toContact: Circle,
  contacted: Send,
  waiting: Hourglass,
  consultation: CalendarCheck,
  seeing: CircleCheck,
  setAside: Archive,
};
