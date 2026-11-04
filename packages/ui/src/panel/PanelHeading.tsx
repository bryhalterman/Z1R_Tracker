/**
 * The parts every panel heading shares, in React with shadcn/ui: the fold
 * caret, and the Clear button the Overworld and Levels headings both carry.
 *
 * The heading itself stays plain DOM — its text names the panel, and
 * `wireCollapsing` keys the folded state off that text — so these are drawn
 * into it as islands.
 */

import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';

export interface PanelToggleProps {
  name: string;
  folded: boolean;
  onToggle: () => void;
}

/**
 * Folds the panel away. The chevron's direction and the button's Show / Hide
 * label both carry the state, so it is not told by rotation alone.
 */
export function PanelToggle({ name, folded, onToggle }: PanelToggleProps) {
  const label = folded ? `Show ${name}` : `Hide ${name}`;
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      data-panel-toggle=""
      aria-expanded={!folded}
      aria-label={label}
      title={label}
      className="z1r-ui -ml-1 cursor-pointer text-muted-foreground hover:text-primary"
      onClick={onToggle}
    >
      {folded ? <ChevronRightIcon /> : <ChevronDownIcon />}
    </Button>
  );
}

export interface ClearButtonProps {
  title: string;
  onClear: () => void;
  className?: string;
}

/**
 * A heading's destructive Clear. Red text and border, but not by hue alone: it
 * sits apart at the end of the heading, and every caller asks before it fires.
 */
export function ClearButton({ title, onClear, className }: ClearButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn('z1r-ui tracking-normal normal-case text-destructive hover:border-destructive', className)}
      title={title}
      onClick={onClear}
    >
      Clear
    </Button>
  );
}
