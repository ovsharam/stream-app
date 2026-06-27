"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

const C = { card: "#ffffff", border: "#e8e6e1", ink: "#111111", muted: "#777777", bg: "#f5f4f1" };

export function Sheet({ open, onOpenChange, children, title }: {
  open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode; title?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 40 }} />
        <Dialog.Content
          style={{
            position: "fixed", right: 0, top: 0, zIndex: 50,
            height: "100%", width: "100%", maxWidth: 480,
            background: C.card, borderLeft: `1px solid ${C.border}`,
            boxShadow: "-12px 0 40px rgba(0,0,0,0.08)",
            display: "flex", flexDirection: "column", outline: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, padding: "14px 20px" }}>
            <Dialog.Title style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: "-0.01em" }}>
              {title ?? "Case detail"}
            </Dialog.Title>
            <Dialog.Close style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: C.muted }}>
              <X size={14} />
            </Dialog.Close>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
