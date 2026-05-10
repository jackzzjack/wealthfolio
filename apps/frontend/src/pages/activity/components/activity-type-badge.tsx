import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { ActivityType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface ActivityTypeBadgeProps {
  type: ActivityType;
  subtype?: string | null;
  className?: string;
}

function getActivityBadgeVariant(type: ActivityType) {
  switch (type) {
    case ActivityType.DIVIDEND:
    case ActivityType.INTEREST:
    case ActivityType.BUY:
    case ActivityType.DEPOSIT:
    case ActivityType.TRANSFER_IN:
      return "success";
    case ActivityType.SELL:
    case ActivityType.WITHDRAWAL:
    case ActivityType.TRANSFER_OUT:
    case ActivityType.FEE:
    case ActivityType.TAX:
      return "destructive";
    case ActivityType.SPLIT:
    case ActivityType.ADJUSTMENT:
      return "secondary";
    default:
      return "default";
  }
}

export function ActivityTypeBadge({ type, subtype, className }: ActivityTypeBadgeProps) {
  const { t } = useTranslation();
  const variant = getActivityBadgeVariant(type);
  const normalizedSubtype = subtype?.trim().toUpperCase();
  const subtypeLabel = normalizedSubtype
    ? t(`activity.subtypes.${normalizedSubtype}`, { defaultValue: subtype })
    : undefined;

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Badge variant={variant} className={cn("rounded-sm", className)}>
        {t(`activity.types.${type}`, { defaultValue: type })}
      </Badge>
      {subtypeLabel && (
        <span className="text-muted-foreground truncate text-xs font-normal">{subtypeLabel}</span>
      )}
    </span>
  );
}
