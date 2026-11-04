import * as React from "react";
import { cn } from "@/lib/utils";

// Input types that carry a native browser picker (calendar / clock).
const PICKER_TYPES = new Set(["date", "datetime-local", "time", "month", "week"]);

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, onClick, ...props }, ref) => {
    const isPicker = !!type && PICKER_TYPES.has(type);
    return (
      <input
        type={type}
        onClick={(e) => {
          // For date/time fields, clicking ANYWHERE on the field opens the native
          // picker (not just the tiny icon), while keyboard entry still works.
          if (isPicker) {
            try {
              e.currentTarget.showPicker?.();
            } catch {
              /* showPicker may throw on unsupported browsers; ignore */
            }
          }
          onClick?.(e);
        }}
        className={cn(
          "flex h-10 w-full rounded-none border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
          // Make the calendar icon visible in both themes and hint clickability.
          isPicker && "cursor-pointer [color-scheme:light] dark:[color-scheme:dark]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
