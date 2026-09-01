"use client";

import { useMemo, useState } from "react";

// Click-a-column-header sorting for the list pages (BUG #11). Each page gives
// a map of column key -> value accessor; the hook holds the {key, dir} state,
// returns the sorted rows and a `headerProps(key)` to spread onto a <th>.
//
//   const { rows, headerProps, sortKey, sortDir } = useTableSort(items, {
//     name: (d) => d.name.toLowerCase(),
//     site: (d) => siteName(d.locationCode).toLowerCase(),
//   });
//   <th {...headerProps("name")}>Name</th>

export type SortDir = "asc" | "desc";
type Accessor<T> = (row: T) => string | number | null | undefined;

export function useTableSort<T>(
  rows: T[],
  accessors: Record<string, Accessor<T>>,
  initial?: { key: string; dir?: SortDir }
) {
  const [sortKey, setSortKey] = useState<string | null>(initial?.key ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(initial?.dir ?? "asc");

  const sorted = useMemo(() => {
    if (!sortKey || !accessors[sortKey]) return rows;
    const acc = accessors[sortKey];
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      // nulls / undefined sort last regardless of direction
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  }, [rows, sortKey, sortDir, accessors]);

  function toggle(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function headerProps(key: string) {
    const active = sortKey === key;
    return {
      onClick: () => toggle(key),
      "aria-sort": (active ? (sortDir === "asc" ? "ascending" : "descending") : "none") as
        | "ascending"
        | "descending"
        | "none",
      className: `th-sortable${active ? " th-sorted" : ""}`,
      "data-sort": active ? sortDir : undefined,
    };
  }

  return { rows: sorted, headerProps, sortKey, sortDir };
}
