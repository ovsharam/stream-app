export function Badge({
  className, variant = "default", ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "signal" | "amber" | "green" | "muted";
}) {
  const styles: Record<string, React.CSSProperties> = {
    default: { background: "#f5f4f1", border: "1px solid #e8e6e1", color: "#777" },
    signal:  { background: "rgba(29,181,132,0.1)", border: "1px solid rgba(29,181,132,0.3)", color: "#1db584" },
    amber:   { background: "rgba(217,119,6,0.1)",  border: "1px solid rgba(217,119,6,0.3)",  color: "#d97706" },
    green:   { background: "rgba(29,181,132,0.1)", border: "1px solid rgba(29,181,132,0.3)", color: "#1db584" },
    muted:   { background: "#eeece8", border: "none", color: "#888" },
  };
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center",
        borderRadius: 6, padding: "2px 7px",
        fontSize: 11, fontWeight: 500,
        fontFamily: "var(--font-jetbrains), monospace",
        ...styles[variant],
      }}
      className={className}
      {...props}
    />
  );
}
