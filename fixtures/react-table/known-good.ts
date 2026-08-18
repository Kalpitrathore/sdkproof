// Verified-compiling reference for @tanstack/react-table v9.
// v9 renamed the primary hook useReactTable -> useTable, and replaced v8's
// getXRowModel() plumbing with an explicit `features` map. The feature set is
// a type parameter, so the column helper and the table must agree on it.
import type { ColumnDef } from "@tanstack/react-table";
import {
  useTable,
  createColumnHelper,
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
} from "@tanstack/react-table";

type User = { id: string; name: string };

const features = { rowSortingFeature, rowPaginationFeature, rowSelectionFeature };
type Features = typeof features;

const helper = createColumnHelper<Features, User>();
// The column array needs an explicit TValue of `any`: accessor() returns a
// narrowed AccessorKeyColumnDef per column, and a heterogeneous array of those
// is not assignable to ColumnDef<..., unknown>[]. Same variance quirk as v8.
const columns: ColumnDef<Features, User, any>[] = [
  helper.accessor("id", { header: "ID" }),
  helper.accessor("name", { header: "Name" }),
];

export function basic(data: User[]) {
  return useTable<Features, User>({ features, columns, data });
}

export function sortable(data: User[]) {
  const table = useTable<Features, User>({ features, columns, data });
  return table.getSortedRowModel();
}

export function paginated(data: User[]) {
  const table = useTable<Features, User>({ features, columns, data });
  return table.getPaginatedRowModel();
}

export function selectable(data: User[], onSelect: (s: unknown) => void) {
  const table = useTable<Features, User>({
    features,
    columns,
    data,
    onRowSelectionChange: onSelect,
  });
  return table.getSelectedRowModel();
}
