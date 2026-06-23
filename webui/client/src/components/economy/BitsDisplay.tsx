export function BitsDisplay(props: { bits: number }) {
  return (
    <div className="panel">
      <strong style={{ fontSize: "1.5rem" }}>{props.bits.toLocaleString()}</strong>
      <div style={{ color: "var(--muted)" }}>bits in your wallet</div>
    </div>
  );
}
