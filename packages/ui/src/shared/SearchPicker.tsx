/**
 * A searchable dropdown: shadcn's combobox pattern, a popover holding a
 * command list that filters as you type. For lists too long to scan in a
 * native select — the 41 hint subjects, the overworld regions.
 */

import { useRef, useState } from 'react';
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
  onPick,
}: {
  /** Names the control for assistive tech; the trigger shows the value. */
  label: string;
  value: string;
  groups: readonly PickerGroup[];
  placeholder: string;
  disabled?: boolean;
  className?: string;
  onPick: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Typing is the fastest way to an entry, so the filter takes focus on open.
  const filter = useRef<HTMLInputElement>(null);
  const current = groups.flatMap((group) => group.options).find((option) => option.value === value);

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={label}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'min-w-0 justify-between gap-1.5', className)}
      >
        <span className={cn('truncate', current ? '' : 'text-muted-foreground italic')}>
          {current ? current.label : placeholder}
        </span>
        <ChevronDownIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" initialFocus={filter} className="z1r-ui w-72 p-0">
        <Command>
          <CommandInput ref={filter} placeholder={`Filter ${label.toLowerCase()}`} />
          <CommandList className="max-h-72">
            <CommandEmpty>Nothing by that name.</CommandEmpty>
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
