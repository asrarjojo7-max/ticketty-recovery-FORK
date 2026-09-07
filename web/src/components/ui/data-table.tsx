"use client";

import { useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  type LucideIcon,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeletons";
import { cn } from "@/lib/utils";

/**
 * Server-paginated table primitive.
 *
 * The backend list endpoints return plain arrays (no total count). The pager
 * therefore uses the "shorter page than limit = last page" convention: when
 * the current page returns fewer rows than `limit`, there is no next page.
 * Sorting/search remain server-side: this table NEVER re-queries client-side
 * derived data or mutates money.
 */
export function DataTable<TData>({
  columns,
  data,
  isLoading,
  isError,
  page,
  limit = 50,
  onPageChange,
  onSearch,
  searchPlaceholder = "بحث…",
  searchValue,
  emptyIcon,
  emptyTitle = "لا توجد نتائج",
  emptyDesc,
  toolbar,
  onRetry,
  className,
}: {
  columns: ColumnDef<TData, unknown>[];
  data: TData[] | undefined;
  isLoading: boolean;
  isError: boolean;
  page: number;
  limit?: number;
  onPageChange: (page: number) => void;
  onSearch?: (search: string) => void;
  searchPlaceholder?: string;
  searchValue?: string;
  emptyIcon: LucideIcon;
  emptyTitle?: string;
  emptyDesc?: string;
  toolbar?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  const [globalFilter, setGlobalFilter] = useState("");
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table's render API is stable per render; core row model only (no memoized state).
  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = data ?? [];
  const isLastPage = rows.length < limit;
  const hasRows = rows.length > 0;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Toolbar */}
      {(onSearch || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {onSearch ? (
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue ?? globalFilter}
                onChange={(e) => {
                  setGlobalFilter(e.target.value);
                  onSearch?.(e.target.value);
                }}
                placeholder={searchPlaceholder}
                className="ps-9"
                aria-label={searchPlaceholder}
              />
            </div>
          ) : null}
          {toolbar}
        </div>
      )}

      {/* Body */}
      {isLoading ? (
        <TableSkeleton rows={5} cols={Math.min(columns.length, 6)} />
      ) : isError ? (
        <EmptyState
          icon={emptyIcon}
          title="تعذّر تحميل البيانات"
          desc="حدث خطأ في الاتصال بالخادم."
          className="border border-dashed"
        />
      ) : !hasRows ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} desc={emptyDesc} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="transition hover:bg-muted/40"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pager */}
          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-2.5">
            <p className="text-[11px] text-muted-foreground">
              صفحة <span className="tabular font-bold">{page}</span> ·{" "}
              <span className="tabular font-bold">{rows.length}</span> سجلاً
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1 || isLoading}
                onClick={() => onPageChange(page - 1)}
                aria-label="الصفحة السابقة"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="tabular rounded-lg border border-border bg-card px-3 py-1 text-xs font-bold">
                {page}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={isLastPage || isLoading}
                onClick={() => onPageChange(page + 1)}
                aria-label="الصفحة التالية"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {isError && onRetry && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={onRetry}>
            إعادة المحاولة
          </Button>
        </div>
      )}
    </div>
  );
}
