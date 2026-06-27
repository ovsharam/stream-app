import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 cursor-pointer border-0",
  {
    variants: {
      variant: {
        default:   "bg-[#111] text-white hover:bg-[#333]",
        secondary: "bg-[#f5f4f1] border border-[#e8e6e1] text-[#111] hover:bg-[#eeece8]",
        ghost:     "bg-transparent text-[#777] hover:bg-[#f5f4f1] hover:text-[#111]",
        amber:     "bg-[rgba(217,119,6,0.08)] text-[#d97706] border border-[rgba(217,119,6,0.3)] hover:bg-[rgba(217,119,6,0.14)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm:      "h-7 px-3 text-xs rounded-md",
        lg:      "h-10 px-6",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";
