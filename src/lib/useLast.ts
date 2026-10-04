import { useState } from "react";

/** `value`, or while it is undefined, what it last was: for drawing something as it was while it goes. */
export function useLast<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState(value);
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}
