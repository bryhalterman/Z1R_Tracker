/**
 * A searchable dropdown: shadcn's combobox pattern, a popover holding a
 * command list that filters as you type. For lists too long to scan in a
 * native select — the 41 hint subjects, the overworld regions, the room
 * layouts.
 */

import { useRef, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { buttonVariants } from '#components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '#components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#components/ui/command';
import { cn } from '#lib/utils';

export interface PickerOption {
  readonly value: string;
  readonly label: string;
  /** Extra words the filter matches on, beyond the label. */
  readonly keywords?: readonly string[];
  /** A picture drawn before the label in the list. */
  readonly icon?: ReactNode;
}

export interface PickerGroup {
  readonly heading?: string;
  readonly options: readonly PickerOption[];
}

export function SearchPicker({
  label,
  value,
  groups,
  placeholder,
  disabled,
  className,
  title,
  namedByValue = false,
  triggerClassName = 'min-w-0 justify-between gap-1.5',
  renderValue,
  emptyText = 'Nothing by that name.',
  listClassName = 'max-h-72',
  onPick,
}: {
  /** Names the control for assistive tech; the trigger shows the value. */
  label: string;
  value: string;
  groups: readonly PickerGroup[];
  /** What the trigger shows with nothing picked; unused with `renderValue`. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  /** Leave the trigger named by the value it shows rather than by `label`. */
  namedByValue?: boolean;
  /** The trigger's layout, in place of the default; `className` still follows it. */
  triggerClassName?: string;
  /** What the trigger shows, in place of the chosen option's label. */
  renderValue?: () => ReactNode;
  /** What the list says when the filter matches nothing. */
  emptyText?: string;
  listClassName?: string;
  onPick: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Closed for good when the control is disabled, not just hidden: masking it
  // with `open && !disabled` left `open` true, and the popover came back on its
  // own the moment the control was enabled again.
  if (disabled && open) setOpen(false);
  // Typing is the fastest way to an entry, so the filter takes focus on open.
  const filter = useRef<HTMLInputElement>(null);
  const current = groups.flatMap((group) => group.options).find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={namedByValue ? undefined : label}
        title={title}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), triggerClassName, className)}
      >
        {renderValue ? (
          renderValue()
        ) : (
          <span className={cn('truncate', current ? '' : 'text-muted-foreground italic')}>
            {current ? current.label : placeholder}
          </span>
        )}
        <ChevronDownIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" initialFocus={filter} className="z1r-ui w-72 p-0">
        <Command>
          <CommandInput ref={filter} placeholder={`Filter ${label.toLowerCase()}`} />
          <CommandList className={listClassName}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map((group, index) => (
              <CommandGroup key={group.heading ?? index} heading={group.heading}>
                {group.options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    keywords={option.keywords ? [...option.keywords] : undefined}
                    data-checked={option.value === value}
                    onSelect={() => {
                      onPick(option.value);
                      setOpen(false);
                    }}
                  >
                    {option.icon}
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
