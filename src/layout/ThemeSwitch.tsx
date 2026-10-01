import { useEffect } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { applyTheme, chooseTheme, useThemeChoice } from "./theme";

const CHOICES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

/** Native radios, so the group is one tab stop and the arrow keys move between choices. */
export function ThemeSwitch() {
  const choice = useThemeChoice();
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  useEffect(() => applyTheme(choice, systemDark), [choice, systemDark]);

  return (
    <fieldset className="flex rounded-lg border p-0.5">
      <legend className="sr-only">Theme</legend>
      {CHOICES.map(({ value, label, Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <label className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground has-checked:bg-muted has-checked:text-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
              <input
                type="radio"
                name="theme"
                value={value}
                checked={choice === value}
                onChange={() =>
                  // Applied here rather than left to the effect, which would change the page before the fade captures it.
                  crossFade(() => {
                    applyTheme(value, systemDark);
                    chooseTheme(value);
                  })
                }
                className="sr-only"
              />
              <Icon aria-hidden className="size-4" />
              <span className="sr-only">{label}</span>
            </label>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </fieldset>
  );
}

/** Cross-fades the whole page from how it looks to how `change` leaves it, where the browser can and motion is welcome. */
function crossFade(change: () => void) {
  if (!("startViewTransition" in document) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return change();
  // Skipped in a hidden tab or by the next pick, when it still makes the change but rejects `ready`.
  document.startViewTransition(change).ready.catch(() => {});
}
