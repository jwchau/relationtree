"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  // Kiln toasts stay dark in both themes, like the app bar.
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--toast)",
          "--normal-text": "var(--band-text)",
          "--normal-border": "var(--band-ghost)",
          "--border-radius": "12px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "font-sans! shadow-[var(--shadow-float)]!",
          error: "border-band-accent! [&_[data-icon]]:text-band-accent!",
          success: "[&_[data-icon]]:text-band-accent!",
          actionButton: "bg-band-ghost! text-band-text! font-nav! font-medium! rounded-[8px]! hover:bg-band-ghost-hover!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
