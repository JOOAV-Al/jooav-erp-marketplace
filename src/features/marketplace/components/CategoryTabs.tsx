"use client";

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface Category {
  label: string;
  slug: string;
}

interface CategoryTabsProps {
  categories: Category[];
  activeSlug?: string;
  onSelect?: (slug: string) => void;
  className?: string;
  showFilterButton?: boolean;
}

export default function CategoryTabs({
  categories,
  activeSlug,
  onSelect,
  className,
  showFilterButton,
}: CategoryTabsProps) {
  return (
    <ScrollArea
      orientation="horizontal"
      isSidebar={true}
      className={cn(
        "w-full whitespace-nowrap -mx-4 px-4 md:mx-0 md:px-0",
        className,
      )}
    >
      <div className="inline-flex items-center h-[63px] gap-5 pb-1">
        {showFilterButton && (
          <button
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap",
              "rounded-md border border-transparent h-[42px] p-md",
              "text-[15px] font-semibold leading-[1.2] tracking-[0.04em] cursor-pointer",
              "transition-[color,box-shadow]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:pointer-events-none disabled:opacity-50",
              "text-body font-medium",
              "bg-storey-foreground! text-heading font-semibold tracking-[0.02em]",
              "shadow-sm border-border-main table-tag",
            )}
          >
            Find by categories
          </button>
        )}
        {categories.map((cat) => {
          const isActive = activeSlug === cat.slug;
          return (
            <button
              key={cat.slug}
              onClick={() => onSelect?.(cat.slug)}
              data-state={isActive ? "active" : "inactive"}
              className={cn(
                // Base — matches admin TabsTrigger
                "inline-flex items-center justify-center whitespace-nowrap",
                "rounded-md border border-transparent h-[42px] p-md",
                "text-[15px] font-semibold leading-[1.2] tracking-[0.04em] cursor-pointer",
                "transition-[color,box-shadow]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:pointer-events-none disabled:opacity-50",
                // Inactive state — matches admin text-body
                "text-body font-medium",
                // Active state — matches admin data-[state=active] rules
                isActive && [
                  "bg-storey-foreground! text-heading font-semibold tracking-[0.02em]",
                  "shadow-sm border-border-main table-tag",
                ],
              )}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
