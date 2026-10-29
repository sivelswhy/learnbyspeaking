/** Radar à N axes (0-100), SVG pur. */
export function Radar({ values, size = 240 }: { values: { label: string; v: number }[]; size?: number }) {
  const c = 100;
  const R = 62;
  const n = values.length;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(a) * r, c + Math.sin(a) * r] as const;
  };
  const poly = values.map((x, i) => pt(i, (Math.max(4, x.v) / 100) * R).join(",")).join(" ");
  return (
    <svg viewBox="-34 -6 268 212" width={size} height={size} className="mx-auto my-2" role="img" aria-label={values.map((x) => `${x.label} ${x.v}`).join(", ")}>
      {[0.33, 0.66, 1].map((k) => <circle key={k} cx={c} cy={c} r={R * k} fill="none" stroke="var(--line)" />)}
      {values.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--line)" strokeDasharray="3 3" />; })}
      <polygon points={poly} fill="color-mix(in srgb, var(--accent) 22%, transparent)" stroke="var(--accent)" strokeWidth="2" />
      {values.map((x, i) => {
        const [lx, ly] = pt(i, R + 22);
        return (
          <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="var(--muted)">
            {x.label}
            <tspan x={lx} dy="11" fontSize="10" fontWeight="700" fill="var(--accent)">{x.v}</tspan>
          </text>
        );
      })}
    </svg>
  );
}
