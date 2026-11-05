/**
 * A map cell's tooltip body: what the cell is as a heading, then one fact per
 * line. Shared by the dungeon rooms and the overworld screens so the two read
 * the same way.
 */
export function CellTip({ heading, lines }: { heading: string; lines: readonly string[] }) {
  return (
    <div className="flex flex-col gap-0.5 text-left">
      <div className="font-semibold">{heading}</div>
      {lines.map((line, index) => (
        <div key={index}>{line.charAt(0).toUpperCase() + line.slice(1)}</div>
      ))}
    </div>
  );
}
