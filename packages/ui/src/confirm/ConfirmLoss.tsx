/**
 * A yes-or-no question before throwing recorded work away, as a shadcn alert
 * dialog rather than the browser's own confirm box.
 *
 * Used by the toolbar's Import and Reset, and — through `askToConfirm` — by the
 * plain-DOM panels' Clear buttons, so every "are you sure" in the tracker is
 * the same dialog.
 */

import { Button } from '#components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';

export interface ConfirmLossText {
  title: string;
  description: string;
  /** The destructive button's label: the verb, not "OK". */
  confirm: string;
}

export function ConfirmLoss({
  open,
  title,
  description,
  confirm,
  onConfirm,
  onCancel,
}: ConfirmLossText & {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent className="z1r-ui">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={onConfirm}>
            {confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
