import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { useTranslation } from "react-i18next";

export interface ActivityDeleteModalProps {
  isOpen?: boolean;
  isDeleting?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function ActivityDeleteModal({
  isOpen,
  isDeleting,
  onConfirm,
  onCancel,
}: ActivityDeleteModalProps) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={isOpen} onOpenChange={onCancel}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("activity.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("activity.delete.description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <Button onClick={() => onConfirm()} className="bg-red-600 focus:ring-red-600">
            {isDeleting ? (
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icons.Trash className="mr-2 h-4 w-4" />
            )}
            <span>{isDeleting ? t("activity.delete.deleting") : t("common.delete")}</span>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
