import {
  DataGrid,
  useDataGrid,
  ColumnDef,
  RowSelectionState,
} from "@wealthfolio/ui";
import { Checkbox } from "@wealthfolio/ui/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wealthfolio/ui/components/ui/tooltip";
import {
  SymbolSearchResult,
} from "@/lib/types";
import {
  DraftActivity,
  DraftActivityStatus,
} from "../context";
import {
  ActivityType,
  SUBTYPES_BY_ACTIVITY_TYPE,
  INSTRUMENT_TYPE_OPTIONS,
} from "@/lib/constants";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { useAccounts } from "@/hooks/use-accounts";
import { searchTicker } from "@/adapters";
import { CreateCustomAssetDialog } from "@/components/create-custom-asset-dialog";
import { useSettingsContext } from "@/lib/settings-provider";
import { useTranslation } from "react-i18next";
import { ImportToolbar, ImportContextMenu } from "./import-toolbar";
import { ActivityTypeBadge } from "../../components/activity-type-badge";
import { needsImportAssetResolution } from "@/lib/activity-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Utils
// ─────────────────────────────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  bgClassName: string;
}

const STATUS_CONFIG: Record<DraftActivityStatus, StatusConfig> = {
  valid: {
    label: "valid",
    bgClassName: "bg-green-100 dark:bg-green-900/30",
  },
  warning: {
    label: "warning",
    bgClassName: "bg-yellow-100 dark:bg-yellow-900/30",
  },
  error: {
    label: "error",
    bgClassName: "bg-red-100 dark:bg-red-900/30",
  },
  skipped: {
    label: "skipped",
    bgClassName: "bg-muted/50",
  },
  duplicate: {
    label: "duplicate",
    bgClassName: "bg-blue-100 dark:bg-blue-900/30",
  },
};

const STATUS_DOT_COLOR: Record<DraftActivityStatus, string> = {
  valid: "bg-green-500",
  warning: "bg-yellow-500",
  error: "bg-red-500",
  skipped: "bg-gray-400",
  duplicate: "bg-blue-500",
};

/**
 * Builds the title text for the status indicator tooltip
 */
function getStatusTitle(
  status: DraftActivityStatus,
  skipReason?: string | null,
  duplicateOfId?: string | null,
  errors?: Record<string, string[]>,
  warnings?: Record<string, string[]>,
  t?: (key: string) => string,
): string | undefined {
  if (status === "skipped") return skipReason || t?.("activity.review.skipped") || "Skipped";
  if (status === "duplicate" && duplicateOfId)
    return t?.("activity.importGrid.duplicateOfExisting") || "Duplicate of an existing activity in your portfolio";

  // Summarize errors and warnings if any
  const errorCount = Object.values(errors || {}).flat().length;
  const warningCount = Object.values(warnings || {}).flat().length;

  if (errorCount > 0) return `${errorCount} error(s)`;
  if (warningCount > 0) return `${warningCount} warning(s)`;

  return t?.(`activity.dataGrid.status.${status}`) || status;
}

// ─────────────────────────────────────────────────────────────────────────────
// Column Definitions
// ─────────────────────────────────────────────────────────────────────────────

interface UseImportReviewColumnsOptions {
  accounts: { id: string; name: string }[];
  onSymbolSearch: (query: string) => Promise<SymbolSearchResult[]>;
  onSymbolSelect?: (rowIndex: number, symbol: string, result?: SymbolSearchResult) => void;
  onCreateCustomAsset?: (rowIndex: number, symbol: string) => void;
}

function useImportReviewColumns({
  accounts,
  onSymbolSearch,
  onSymbolSelect,
  onCreateCustomAsset,
}: UseImportReviewColumnsOptions): ColumnDef<DraftActivity>[] {
  const { t } = useTranslation();
  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.id,
        label: account.name,
      })),
    [accounts],
  );

  const activityTypeOptions = useMemo(
    () =>
      Object.values(ActivityType).map((type) => ({
        value: type,
        label: t(`activity.types.${type}`, { defaultValue: type }),
      })),
    [t],
  );

  // Dynamic subtype options based on activity type
  const getSubtypeOptions = useCallback(
    (rowData: unknown) => {
      const draft = rowData as DraftActivity;
      const activityType = draft.activityType?.toUpperCase();
      if (!activityType) return [];

      const allowedSubtypes = SUBTYPES_BY_ACTIVITY_TYPE[activityType] || [];
      return allowedSubtypes.map((subtype) => ({
        value: subtype,
        label: t(`activity.subtypes.${subtype}`, { defaultValue: subtype }),
      }));
    },
    [t],
  );

  return useMemo<ColumnDef<DraftActivity>[]>(
    () => [
      // === Pinned left (always visible) ===
      // 1. Select
      {
        id: "select",
        header: ({ table }: { table: any }) => (
          <Checkbox
            disabled={!table.getRowModel().rows.some((row: any) => row.getCanSelect())}
            checked={
              table.getIsAllRowsSelected() || (table.getIsSomeRowsSelected() && "indeterminate")
            }
            onCheckedChange={(checked) => table.toggleAllRowsSelected(Boolean(checked))}
            aria-label={t("activity.dataGrid.selectAllRows")}
          />
        ),
        cell: ({ row }: { row: any }) => (
          <Checkbox
            disabled={!row.getCanSelect()}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
            aria-label={t("activity.dataGrid.selectRow")}
          />
        ),
        size: 40,
        minSize: 40,
        maxSize: 40,
        enableSorting: false,
        enableResizing: false,
        enableHiding: false,
        enablePinning: true,
      },
      // 2. Status indicator (row number + validation status)
      {
        id: "status",
        header: () => t("activity.importGrid.rowNumber"),
        cell: ({ row }) => {
          const {
            status,
            skipReason,
            duplicateOfId,
            errors,
            warnings,
            rowIndex,
            forceImport,
          } = row.original;
          const isForcedDuplicate = status === "duplicate" && forceImport;
          const title = isForcedDuplicate
            ? t("activity.importGrid.willBeImportedOverridesDuplicateDetection")
            : getStatusTitle(
                status,
                skipReason,
                duplicateOfId,
                errors,
                warnings,
                t,
              );
          const dotColor = isForcedDuplicate ? "bg-amber-500" : STATUS_DOT_COLOR[status];
          const dot = dotColor ? (
            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
          ) : null;
          return (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground shrink-0 text-xs">{rowIndex + 1}</span>
              {dot && title ? (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>{dot}</TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className={
                        status === "error"
                          ? "bg-destructive text-destructive-foreground border-destructive max-w-xs whitespace-pre-wrap text-xs"
                          : "max-w-xs whitespace-pre-wrap text-xs"
                      }
                    >
                      {title}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                dot
              )}
            </div>
          );
        },
        size: 70,
        minSize: 70,
        maxSize: 70,
        enableSorting: false,
        enableResizing: false,
        enableHiding: false,
        enablePinning: true,
      },
      // 3. Date & Time
      {
        id: "activityDate",
        accessorKey: "activityDate",
        header: t("activity.detailSheet.dateTime"),
        size: 180,
        meta: { cell: { variant: "datetime" } },
      },
      // 4. Account
      {
        id: "accountId",
        accessorKey: "accountId",
        header: t("activity.table.account"),
        size: 180,
        meta: { cell: { variant: "select", options: accountOptions } },
      },

      // === Identity / classification ===
      // 5. Type
      {
        id: "activityType",
        accessorKey: "activityType",
        header: t("activity.table.type"),
        size: 150,
        enablePinning: false,
        meta: {
          cell: {
            variant: "select",
            options: activityTypeOptions,
            valueRenderer: (value: string, _option: any, rowData: any) => (
              <ActivityTypeBadge
                type={value as ActivityType}
                subtype={(rowData as { subtype?: string } | undefined)?.subtype}
                className="text-xs font-normal"
              />
            ),
          },
        },
      },
      // 6. Subtype - dynamic options based on activity type
      {
        id: "subtype",
        accessorKey: "subtype",
        header: t("activity.detailSheet.subtype"),
        size: 180,
        enableSorting: false,
        enableHiding: true,
        meta: {
          cell: {
            variant: "select",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            options: getSubtypeOptions as any,
            allowEmpty: true,
            emptyLabel: t("activity.form.none"),
          },
        },
      },
      // 7. External (checkbox for TRANSFER_IN/TRANSFER_OUT only)
      {
        id: "isExternal",
        accessorKey: "isExternal",
        header: t("activity.importGrid.external"),
        size: 80,
        enableSorting: false,
        enableHiding: true,
        meta: {
          cell: {
            variant: "checkbox",
            // Only enabled for transfer types
            isDisabled: (rowData: unknown) => {
              const row = rowData as DraftActivity;
              const activityType = row.activityType?.toUpperCase();
              return (
                activityType !== ActivityType.TRANSFER_IN &&
                activityType !== ActivityType.TRANSFER_OUT
              );
            },
          },
        },
      },
      // 8. Symbol
      {
        id: "symbol",
        accessorKey: "symbol",
        header: t("activity.table.symbol"),
        size: 140,
        meta: {
          cell: {
            variant: "symbol",
            onSearch: onSymbolSearch,
            onSelect: onSymbolSelect,
            onCreateCustomAsset,
            isClearable: (rowData: unknown) => {
              const row = rowData as DraftActivity;
              return !needsImportAssetResolution(row.activityType ?? "", row.subtype);
            },
          },
        },
      },
      // 9. Instrument Type
      {
        id: "instrumentType",
        accessorKey: "instrumentType",
        header: t("activity.viewControls.instrument"),
        size: 120,
        enableSorting: false,
        enableHiding: true,
        meta: {
          cell: {
            variant: "select",
            options: [...INSTRUMENT_TYPE_OPTIONS].map((opt) => ({
              ...opt,
              label: t(`activity.instrumentTypes.${opt.value}`, { defaultValue: opt.label }),
            })),
            allowEmpty: true,
            emptyLabel: t("activity.dataGrid.auto"),
          },
        },
      },

      // === Values ===
      // 10. Quantity
      {
        id: "quantity",
        accessorKey: "quantity",
        header: t("activity.table.quantity"),
        size: 120,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001, valueType: "string" } },
      },
      // 11. Unit Price
      {
        id: "unitPrice",
        accessorKey: "unitPrice",
        header: t("activity.tableMobile.price"),
        size: 120,
        enableSorting: false,
        meta: {
          cell: {
            variant: "number",
            step: 0.000001,
            valueType: "string",
            helpText: t("activity.importGrid.unitPriceHelpText"),
          },
        },
      },
      // 12. Amount
      {
        id: "amount",
        accessorKey: "amount",
        header: t("activity.detailSheet.amount"),
        size: 120,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001, valueType: "string" } },
      },
      // 13. Currency
      {
        id: "currency",
        accessorKey: "currency",
        header: t("activity.table.currency"),
        size: 110,
        enableSorting: false,
        meta: { cell: { variant: "currency" } },
      },
      // 14. Fee
      {
        id: "fee",
        accessorKey: "fee",
        header: t("activity.table.fee"),
        size: 100,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001, valueType: "string" } },
      },
      // 15. FX Rate
      {
        id: "fxRate",
        accessorKey: "fxRate",
        header: t("activity.detailSheet.fxRate"),
        size: 100,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001, valueType: "string" } },
      },

      // === Metadata ===
      // 16. Comment
      {
        id: "comment",
        accessorKey: "comment",
        header: t("activity.dataGrid.comment"),
        size: 260,
        enableSorting: false,
        meta: { cell: { variant: "long-text" } },
      },
    ],
    [
      accountOptions,
      activityTypeOptions,
      getSubtypeOptions,
      onSymbolSearch,
      onSymbolSelect,
      onCreateCustomAsset,
      t,
    ],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportReviewGridProps {
  drafts: DraftActivity[];
  nonSelectableRowIndexes?: number[];
  onDraftUpdate: (rowIndex: number, updates: Partial<DraftActivity>) => void;
  selectedRows: number[];
  onSelectionChange: (selectedRows: number[]) => void;
  onBulkSkip: (rowIndexes: number[]) => void;
  onBulkUnskip: (rowIndexes: number[]) => void;
  onBulkForceImport?: (rowIndexes: number[]) => void;
  onBulkSetCurrency: (rowIndexes: number[], currency: string) => void;
  onBulkSetAccount: (rowIndexes: number[], accountId: string) => void;
  gridHeight?: string;
}

export function ImportReviewGrid({
  drafts,
  nonSelectableRowIndexes = [],
  onDraftUpdate,
  selectedRows,
  onSelectionChange,
  onBulkSkip,
  onBulkUnskip,
  onBulkForceImport,
  onBulkSetCurrency,
  onBulkSetAccount,
  gridHeight,
}: ImportReviewGridProps) {
  const { t } = useTranslation();
  const { settings } = useSettingsContext();
  const fallbackCurrency = settings?.baseCurrency ?? "USD";
  const nonSelectableRowIndexSet = useMemo(
    () => new Set(nonSelectableRowIndexes),
    [nonSelectableRowIndexes],
  );

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
  }>({ open: false, x: 0, y: 0 });

  // Custom asset dialog state
  const [customAssetDialog, setCustomAssetDialog] = useState<{
    open: boolean;
    rowIndex: number;
    symbol: string;
  }>({ open: false, rowIndex: -1, symbol: "" });

  const { accounts } = useAccounts({ filterActive: true, includeArchived: false });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSkip = useCallback(() => {
    onBulkSkip(selectedRows);
  }, [onBulkSkip, selectedRows]);

  const handleUnskip = useCallback(() => {
    onBulkUnskip(selectedRows);
  }, [onBulkUnskip, selectedRows]);

  const handleForceImport = useCallback(() => {
    onBulkForceImport?.(selectedRows);
  }, [onBulkForceImport, selectedRows]);

  const handleSetCurrency = useCallback(
    (currency: string) => {
      onBulkSetCurrency(selectedRows, currency);
    },
    [onBulkSetCurrency, selectedRows],
  );

  const handleSetAccount = useCallback(
    (accountId: string) => {
      onBulkSetAccount(selectedRows, accountId);
    },
    [onBulkSetAccount, selectedRows],
  );

  const handleClearSelection = useCallback(() => {
    onSelectionChange([]);
  }, [onSelectionChange]);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (selectedRows.length === 0) return;
    e.preventDefault();
    setContextMenu({ open: true, x: e.clientX, y: e.clientY });
  };

  const handleContextMenuOpenChange = (open: boolean) => {
    setContextMenu((prev) => ({ ...prev, open }));
  };

  const handleWheel = (_e: React.WheelEvent) => {
    if (contextMenu.open) {
      setContextMenu((prev) => ({ ...prev, open: false }));
    }
  };

  // ── Symbol Search & Selection ──────────────────────────────────────────────

  // Handle symbol search from grid
  const handleSymbolSearch = useCallback(async (query: string) => {
    if (query.length < 1) return [];
    try {
      const results = await searchTicker(query);
      return results;
    } catch (err) {
      console.error("Failed to search symbol:", err);
      return [];
    }
  }, []);

  // Handle symbol selection from grid search results
  const handleSymbolSelect = useCallback(
    (rowIndex: number, _symbol: string, result?: SymbolSearchResult) => {
      if (!result) return;

      // Find the draft by rowIndex
      const draft = drafts.find((d) => d.rowIndex === rowIndex);
      if (!draft) return;

      // Currency fallback: search result → current draft currency → fallback
      const currency = result.currency ?? draft.currency ?? fallbackCurrency;

      onDraftUpdate(rowIndex, {
        symbol: result.symbol,
        currency,
        exchangeMic: result.exchangeMic,
        quoteCcy: result.currency ?? draft.quoteCcy,
        instrumentType: result.quoteType,
        quoteMode: result.dataSource === "MANUAL" ? "MANUAL" : undefined,
        symbolName: result.longName || result.shortName || draft.symbolName,
        assetId: undefined,
        importAssetKey: undefined,
      });
    },
    [drafts, fallbackCurrency, onDraftUpdate],
  );

  // Request to create a custom asset - opens the dialog
  const handleCreateCustomAsset = useCallback((rowIndex: number, symbol: string) => {
    setCustomAssetDialog({ open: true, rowIndex, symbol });
  }, []);

  // Handle custom asset created from dialog
  const handleCustomAssetCreated = useCallback(
    (result: SymbolSearchResult) => {
      const { rowIndex } = customAssetDialog;
      if (rowIndex < 0) return;

      // Find the draft by rowIndex
      const draft = drafts.find((d) => d.rowIndex === rowIndex);
      if (!draft) return;

      const currency = result.currency ?? draft.currency ?? fallbackCurrency;

      onDraftUpdate(rowIndex, {
        symbol: result.symbol,
        currency,
        exchangeMic: result.exchangeMic,
        quoteCcy: result.currency ?? draft.quoteCcy,
        instrumentType: result.quoteType,
        quoteMode: result.dataSource === "MANUAL" ? "MANUAL" : undefined,
        symbolName: result.longName || result.shortName || draft.symbolName,
        assetId: undefined,
        importAssetKey: undefined,
      });

      setCustomAssetDialog({ open: false, rowIndex: -1, symbol: "" });
    },
    [customAssetDialog, drafts, fallbackCurrency, onDraftUpdate],
  );

  // Column definitions
  const columns = useImportReviewColumns({
    accounts,
    onSymbolSearch: handleSymbolSearch,
    onSymbolSelect: handleSymbolSelect,
    onCreateCustomAsset: handleCreateCustomAsset,
  });

  // Ref to track if we're in the middle of syncing selection
  const isSyncingRef = useRef(false);

  // Convert selectedRows (row indices) to initial row selection state
  const initialRowSelection = useMemo(() => {
    const selection: RowSelectionState = {};
    for (const rowIndex of selectedRows) {
      selection[String(rowIndex)] = true;
    }
    return selection;
  }, [selectedRows]);

  // Handle data changes from inline editing
  const handleDataChange = useCallback(
    (nextData: DraftActivity[]) => {
      // Find which rows changed and dispatch updates
      for (let i = 0; i < nextData.length; i++) {
        const nextRow = nextData[i];
        const prevRow = drafts[i];

        if (nextRow !== prevRow) {
          // Something changed in this row
          const updates: Partial<DraftActivity> = {};
          const fields: (keyof DraftActivity)[] = [
            "activityDate",
            "activityType",
            "symbol",
            "instrumentType",
            "quantity",
            "unitPrice",
            "amount",
            "currency",
            "fee",
            "fxRate",
            "subtype",
            "isExternal",
            "accountId",
            "comment",
          ];

          for (const field of fields) {
            if (nextRow[field] !== prevRow[field]) {
              (updates as Record<string, unknown>)[field] = nextRow[field];
            }
          }

          if (Object.keys(updates).length > 0) {
            onDraftUpdate(nextRow.rowIndex, updates);
          }
        }
      }
    },
    [drafts, onDraftUpdate],
  );

  // Keep a synchronously-updated ref so getCellState always reads the latest
  // drafts even when the DataGrid's internal propsRef lags by one layout-effect.
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  // Cell state callback for error/warning highlighting with messages
  const getCellState = useCallback(
    (
      rowIndex: number,
      columnId: string,
    ): { type: "error" | "warning"; messages: string[] } | null => {
      const draft = draftsRef.current[rowIndex];
      if (!draft) return null;

      // Skip non-data columns
      if (columnId === "select" || columnId === "status") return null;

      // Check for errors first (higher priority)
      const errors = draft.errors?.[columnId];
      if (errors?.length) {
        return { type: "error", messages: errors };
      }

      // Then check for warnings
      const warnings = draft.warnings?.[columnId];
      if (warnings?.length) {
        return { type: "warning", messages: warnings };
      }

      return null;
    },
    [],
  );

  // Initialize data grid
  const dataGrid = useDataGrid<DraftActivity>({
    data: drafts,
    columns,
    getRowId: (row) => String(row.rowIndex),
    enableRowSelection: (row) => !nonSelectableRowIndexSet.has(row.original.rowIndex),
    enableMultiRowSelection: true,
    enableSorting: false,
    enableColumnFilters: false,
    enableSearch: false,
    enablePaste: true,
    onDataChange: handleDataChange,

    meta: {
      getCellState,
    } as any,
    initialState: {
      rowSelection: initialRowSelection,
      columnPinning: { left: ["select", "status"] },
      columnVisibility: {
        subtype: true,
        isExternal: true,
      },
    },
  });

  // Sync selection changes to parent
  const tableSelectedRows = dataGrid.table.getSelectedRowModel().rows;
  const prevSelectedRef = useRef<number[]>([]);

  useEffect(() => {
    const selectableRows = selectedRows.filter(
      (rowIndex) => !nonSelectableRowIndexSet.has(rowIndex),
    );
    if (selectableRows.length !== selectedRows.length) {
      onSelectionChange(selectableRows);
    }
  }, [selectedRows, onSelectionChange, nonSelectableRowIndexSet]);

  useEffect(() => {
    if (isSyncingRef.current) return;

    const currentSelected = tableSelectedRows.map((row) => row.original.rowIndex).sort();
    const prevSelected = prevSelectedRef.current;

    // Check if selection actually changed
    const hasChanged =
      currentSelected.length !== prevSelected.length ||
      currentSelected.some((idx, i) => idx !== prevSelected[i]);

    if (hasChanged) {
      prevSelectedRef.current = currentSelected;
      onSelectionChange(currentSelected);
    }
  }, [tableSelectedRows, onSelectionChange]);

  // Sync external selection changes to table
  useEffect(() => {
    const currentTableSelection = dataGrid.table.getState().rowSelection;
    const newSelection: RowSelectionState = {};

    for (const rowIndex of selectedRows) {
      newSelection[String(rowIndex)] = true;
    }

    // Check if external selection differs from table selection
    const tableKeys = Object.keys(currentTableSelection).filter((k) => currentTableSelection[k]);
    const newKeys = Object.keys(newSelection);

    const needsSync =
      tableKeys.length !== newKeys.length ||
      tableKeys.some((k) => !newSelection[k]) ||
      newKeys.some((k) => !currentTableSelection[k]);

    if (needsSync) {
      isSyncingRef.current = true;
      dataGrid.table.setRowSelection(newSelection);
      // Reset sync flag after microtask to allow state to settle
      queueMicrotask(() => {
        isSyncingRef.current = false;
      });
    }
  }, [selectedRows, dataGrid.table]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Bulk operations toolbar */}
      <ImportToolbar
        selectedCount={selectedRows.length}
        onSkip={handleSkip}
        onUnskip={handleUnskip}
        onForceImport={onBulkForceImport ? handleForceImport : undefined}
        onSetCurrency={handleSetCurrency}
        onSetAccount={handleSetAccount}
        onClearSelection={handleClearSelection}
      />

      {/* Data grid with context menu support */}
      <div className="min-h-0 flex-1" onContextMenu={handleContextMenu} onWheel={handleWheel}>
        <DataGrid
          {...dataGrid}
          stretchColumns
          height={gridHeight ?? "calc(100vh - 360px)"}
          className="text-sm"
        />
      </div>

      {/* Context menu */}
      <ImportContextMenu
        open={contextMenu.open}
        position={{ x: contextMenu.x, y: contextMenu.y }}
        onOpenChange={handleContextMenuOpenChange}
        selectedCount={selectedRows.length}
        onSkip={handleSkip}
        onUnskip={handleUnskip}
        onForceImport={onBulkForceImport ? handleForceImport : undefined}
        onSetCurrency={handleSetCurrency}
        onSetAccount={handleSetAccount}
      />

      {/* Custom asset creation dialog */}
      <CreateCustomAssetDialog
        open={customAssetDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setCustomAssetDialog({ open: false, rowIndex: -1, symbol: "" });
          }
        }}
        onAssetCreated={handleCustomAssetCreated}
        defaultSymbol={customAssetDialog.symbol}
        defaultCurrency={
          customAssetDialog.rowIndex >= 0
            ? (drafts.find((d) => d.rowIndex === customAssetDialog.rowIndex)?.currency ??
              fallbackCurrency)
            : fallbackCurrency
        }
      />
    </div>
  );
}

export default ImportReviewGrid;
