import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-none border border-field bg-transparent px-3.5 py-3 text-base text-text transition-[border-color,box-shadow] duration-200 outline-none placeholder:text-subtle focus-visible:border-accent-text focus-visible:shadow-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-accent-text",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
