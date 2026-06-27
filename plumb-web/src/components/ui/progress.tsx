export function Progress({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = clamped >= 60 ? "#1db584" : clamped >= 40 ? "#d97706" : "#ef4444";
  return (
    <div style={{ height: 4, width: "100%", borderRadius: 99, background: "#eeece8", overflow: "hidden" }} className={className}>
      <div style={{ width: `${clamped}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.3s" }} />
    </div>
  );
}
