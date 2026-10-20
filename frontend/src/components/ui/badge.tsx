import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[12px] px-2.5 py-0.5 text-[13px] leading-5 font-semibold whitespace-nowrap transition-colors duration-200 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        // Amber marks "you", and nothing else.
        default: "bg-amber-tint text-amber-text",
        secondary: "bg-ghost text-text",
        destructive: "bg-ghost text-accent-text",
        outline: "text-muted-foreground shadow-[inset_0_0_0_1px_var(--hairline)] [a&]:hover:bg-ghost",
        ghost: "[a&]:hover:bg-ghost",
        link: "text-accent-text underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
