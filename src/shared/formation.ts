/** Keep portraits in separate cells and paginate before labels become unreadable. */
export function formation(
  width: number,
  height: number,
  count: number,
  enemy: boolean,
) {
  const expanded = count > 4;
  const zoneWidth = Math.max(90, (width - 72) * (expanded ? 1 : 0.55));
  const columns = Math.max(1, Math.floor(zoneWidth / 96));
  const rows =
    ((enemy && count > 4) || count > columns) && height >= 400 ? 2 : 1;
  const capacity = columns * rows;
  const shown = Math.min(count, capacity);
  const usedRows = Math.min(rows, Math.max(1, shown));
  return {
    expanded,
    capacity,
    rows: usedRows,
    columns: Math.max(1, Math.ceil(shown / usedRows)),
  };
}
