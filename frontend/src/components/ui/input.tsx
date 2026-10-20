import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-none border border-field bg-transparent px-3.5 py-2 text-base text-text transition-[border-color,box-shadow] duration-200 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-subtle disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-accent-text focus-visible:shadow-[var(--focus)]",
        "aria-invalid:border-accent-text",
        className
      )}
      {...props}
    />
  )
}

export { Input }
