/**
 * The parts every panel heading shares, in React with shadcn/ui: the fold
 * caret, and the Clear button the Overworld and Levels headings both carry.
 *
 * The heading itself stays plain DOM — its text names the panel, and
 * `wireCollapsing` keys the folded state off that text — so these are drawn
 * into it as islands.
 */

import { ChevronDownIcon, ChevronRightIcon, CircleHelpIcon } from 'lucide-react';
import { Button } from '#components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#components/ui/tooltip';
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

export interface HelpTipProps {
  /** What the button is called to assistive tech, for example "How to use Items". */
  label: string;
  /** The tooltip's text, one paragraph per entry. */
  lines: readonly string[];
}

/**
 * A ? in a heading that explains the panel on hover or focus, so the
 * instructions stop costing a line of the panel's height.
 */
export function HelpTip({ label, lines }: HelpTipProps) {
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={label}
              className="z1r-ui cursor-help text-muted-foreground hover:text-primary"
            />
          }
        >
          <CircleHelpIcon />
        </TooltipTrigger>
        <TooltipContent className="z1r-ui max-w-64 normal-case tracking-normal">
          <div className="flex flex-col gap-1 text-left font-normal">
            {lines.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
