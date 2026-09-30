import { IconButton } from "@/components/IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_ICON, STATUS_LABEL } from "./status";
import { STATUSES, statusOf, type ShortlistCard, type Status } from "./store";
import { useShortlistEntry, useShortlistStore } from "./useShortlist";

type Props = {
  therapist: ShortlistCard;
  /** After a new status is chosen, for a list to follow the therapist to where it puts them. */
  onChosen?: (status: Status) => void;
  /** After the menu takes the therapist off the shortlist. */
  onRemoved?: () => void;
};

/** Where the visitor stands with a shortlisted therapist, to change or to take them off the list; nothing for anyone else. */
export function StatusMenu({ therapist, onChosen, onRemoved }: Props) {
  const store = useShortlistStore();
  const entry = useShortlistEntry(therapist.slug);
  if (!entry) return null;
  const status = statusOf(entry);
  const Icon = STATUS_ICON[status];

  function choose(value: string) {
    const chosen = value as Status;
    if (chosen === status) return;
    store.setStatus(therapist.slug, chosen);
    onChosen?.(chosen);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Marked by slug, for a list to give it focus once the therapist has moved. */}
        <IconButton
          label={`Status of ${therapist.name}: ${STATUS_LABEL[status].toLowerCase()}`}
          variant="ghost"
          size="icon-sm"
          data-status-menu={therapist.slug}
        >
          <Icon aria-hidden />
        </IconButton>
      </DropdownMenuTrigger>
      {/* As wide as its longest item, where shadcn's matches the trigger's width. */}
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuRadioGroup value={status} onValueChange={choose}>
          {STATUSES.map((option) => {
            const OptionIcon = STATUS_ICON[option];
            return (
              <DropdownMenuRadioItem key={option} value={option}>
                <OptionIcon aria-hidden className="text-muted-foreground" />
                {STATUS_LABEL[option]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            store.remove(therapist.slug);
            onRemoved?.();
          }}
        >
          Remove from shortlist
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
