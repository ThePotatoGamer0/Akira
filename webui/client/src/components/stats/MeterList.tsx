export function MeterList(props: {
  rows: { id: string; name: string; value: number; label: string }[];
  youId?: string;
  empty: string;
}) {
  const max = props.rows.reduce((highest, row) => Math.max(highest, row.value), 0);
  if (props.rows.length === 0) return <p className="webui-muted">{props.empty}</p>;
  return (
    <ol className="stat-meters">
      {props.rows.map((row, index) => {
        const width = max > 0 ? (row.value / max) * 100 : 0;
        const you = row.id === props.youId;
        return (
          <li key={row.id} className={you ? "stat-row stat-row--you" : "stat-row"}>
            <span className={index === 0 ? "stat-row__rank stat-row__rank--lead" : "stat-row__rank"}>{index + 1}</span>
            <span className="stat-row__name">
              {row.name}
              {you ? <span className="stat-row__you">you</span> : null}
            </span>
            <span className="stat-row__track" aria-hidden="true">
              <span className="stat-row__fill" style={{ width: `${width}%` }} />
            </span>
            <span className="stat-row__value">{row.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
