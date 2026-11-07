/**
 * The pieces the room card and the screen card are both built from: a
 * labelled row, a two-state chip, and a choice of one answer out of a few.
 */

import type { ReactNode } from 'react';
import { CheckIcon } from 'lucide-react';
import { Toggle } from '#components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '#components/ui/toggle-group';
import { cn } from '#lib/utils';

/** The key column's width: the room card's short keys, or the screen card's longer ones. */
const ROW_GRID = {
  narrow: 'grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-2',
  wide: 'grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-2',
} as const;

/** A labelled row: the key in a fixed column, the controls wrapping beside it. */
export function Row({
  label,
  keys = 'narrow',
  children,
}: {
  label: string;
  keys?: keyof typeof ROW_GRID;
  children: ReactNode;
}) {
  return (
    <div className={ROW_GRID[keys]}>
      <span className="pt-1.5 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/**
 * A two-state chip. The check in front of the label is its non-color mark;
 * the pressed fill only repeats it.
 */
export function CheckToggle({
  label,
  pressed,
  disabled,
  title,
  className,
  onPressedChange,
}: {
  label: string;
  pressed: boolean;
  disabled?: boolean;
  title?: string;
  /** Added after the pressed border. */
  className?: string;
  onPressedChange: (pressed: boolean) => void;
}) {
  return (
    <Toggle
      variant="outline"
      size="sm"
      pressed={pressed}
      disabled={disabled}
      title={title}
      onPressedChange={onPressedChange}
      className={cn('data-[pressed]:border-primary', className)}
    >
      {pressed ? <CheckIcon data-icon="inline-start" /> : null}
      {label}
    </Toggle>
  );
}

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly text: string;
  readonly title?: string;
  readonly hidden?: boolean;
  readonly disabled?: boolean;
}

/** The chosen answer is underlined as well as ringed, so it does not rest on color. */
const PRESSED = 'data-[pressed]:border-primary data-[pressed]:underline data-[pressed]:underline-offset-4';

/**
 * One answer out of a few. Clicking the pressed answer again empties the
 * group, which `onChange` receives as ''.
 *
 * A joined strip by default. `tiles` draws separate tiles that wrap instead,
 * for a row too long for the card it sits in: a joined strip cannot break a
 * line.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  disabled,
  tiles = false,
  optionProps,
  onChange,
}: {
  label: string;
  /** The pressed answer; null or '' with none pressed. */
  value: T | '' | null;
  options: readonly SegmentedOption<T>[];
  disabled?: boolean;
  tiles?: boolean;
  /** Extra props for one answer's button, such as what hovering it points at. */
  optionProps?: (value: T) => object;
  onChange: (value: T | '') => void;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="outline"
      size="sm"
      spacing={tiles ? 1 : 0}
      className={tiles ? 'flex-wrap' : undefined}
      value={value ? [value] : []}
      disabled={disabled}
      onValueChange={(next) => onChange((next[0] as T | undefined) ?? '')}
    >
      {options
        .filter((option) => !option.hidden)
        .map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            title={option.title}
            disabled={option.disabled}
            className={tiles ? `min-w-7 ${PRESSED}` : PRESSED}
            {...optionProps?.(option.value)}
          >
            {option.text}
          </ToggleGroupItem>
        ))}
    </ToggleGroup>
  );
}
