// How far along the catalogue a patrol is. The bar is ornament over a fact: the same two numbers
// are printed above it in words, and the whole thing carries an aria-label, so nothing here is
// knowable only by looking at the fill.
export function QuestMeter({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  // A troop with an empty catalogue would divide by zero on its very first screen.
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="meter-block">
      <p className="meter-label">
        <span>{label}</span>
        <span>
          <b>{value}</b> / {total}
        </span>
      </p>
      <div className="meter" role="img" aria-label={`${value} skill conseguite su ${total}`}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
