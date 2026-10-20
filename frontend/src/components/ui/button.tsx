import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[12px] font-nav text-base font-medium whitespace-nowrap transition-[background-color,background-image,color,box-shadow] duration-200 ease-in-out outline-none focus-visible:shadow-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        // The one primary action on a view.
        default: "ember font-emphasis font-bold",
        outline: "bg-ghost text-text hover:bg-ghost-hover active:bg-ghost-active",
        secondary: "bg-ghost text-text hover:bg-ghost-hover active:bg-ghost-active",
        ghost: "text-text hover:bg-ghost active:bg-ghost-hover",
        // Kiln has no red: a destructive control is a ghost with accent text.
        destructive: "bg-ghost text-accent-text hover:bg-ghost-hover active:bg-ghost-active",
        // On an ink band, whatever the device theme.
        band: "bg-band-ghost text-band-text hover:bg-band-ghost-hover",
        link: "text-accent-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-12 px-5",
        xs: "h-8 gap-1 rounded-[8px] px-2 text-sm [&_svg:not([class*='size-'])]:size-4",
        sm: "h-10 gap-1.5 px-4 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-14 px-6",
        icon: "size-12 rounded-[14px]",
        "icon-xs": "size-8 rounded-[8px] [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-10 rounded-[14px] [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-14 rounded-[14px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
