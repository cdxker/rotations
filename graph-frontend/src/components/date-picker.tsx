import { useState } from "react"
import { addDays, addMonths, addYears, format } from "date-fns"
import type {DateRange} from "react-day-picker";

import { useGraph } from "#/contexts/graphContext"
import { Button } from "#/components/ui/button"
import { Calendar } from "#/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover"

const PRESETS = [
  { label: "Today", range: () => { const d = new Date(); return { from: d, to: d } } },
  { label: "Past 2 days", range: () => ({ from: addDays(new Date(), -2), to: new Date() }) },
  { label: "Past week", range: () => ({ from: addDays(new Date(), -7), to: new Date() }) },
  { label: "Past month", range: () => ({ from: addMonths(new Date(), -1), to: new Date() }) },
  { label: "Past 3 months", range: () => ({ from: addMonths(new Date(), -3), to: new Date() }) },
  { label: "Past year", range: () => ({ from: addYears(new Date(), -1), to: new Date() }) },
] as const

function formatRange(range: DateRange | undefined): string {
  if (!range?.from) return ""
  if (!range.to || format(range.from, "PP") === format(range.to, "PP")) return format(range.from, "LLL dd, y")
  return `${format(range.from, "LLL dd, y")} – ${format(range.to, "LLL dd, y")}`
}

export function DatePicker() {
  const { dateRange, setDateRange: onDateRangeChange } = useGraph()
  const [open, setOpen] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [activeLabel, setActiveLabel] = useState<string>("All time")

  function selectPreset(label: string, range: DateRange | undefined) {
    setActiveLabel(label)
    onDateRangeChange(range)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowCalendar(false) }}>
      <PopoverTrigger asChild>
        <button className="text-left cursor-pointer">
          <div className="text-black dark:text-white text-sm font-medium">{activeLabel}</div>
          {dateRange?.from && (
            <div className="text-neutral-600 dark:text-neutral-500 text-xs">{formatRange(dateRange)}</div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700" align="start">
        {!showCalendar ? (
          <div className="flex flex-col p-2 gap-1">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                className="justify-start text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => selectPreset(preset.label, preset.range())}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              className="justify-start text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => selectPreset("All time", undefined)}
            >
              All time
            </Button>
            <div className="border-t border-neutral-200 dark:border-neutral-700 my-1" />
            <Button
              variant="ghost"
              className="justify-start text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => setShowCalendar(true)}
            >
              Custom range...
            </Button>
          </div>
        ) : (
          <>
            <Calendar
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={(range) => {
                onDateRangeChange(range)
                if (range?.from && range.to) {
                  setActiveLabel("Custom")
                }
              }}
              numberOfMonths={2}
              className="bg-white dark:bg-neutral-900 text-black dark:text-white"
            />
            <div className="p-2 border-t border-neutral-200 dark:border-neutral-700 flex gap-2">
              <Button
                variant="ghost"
                className="flex-1 text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => setShowCalendar(false)}
              >
                Back
              </Button>
              {dateRange?.from && dateRange.to && (
                <Button
                  variant="ghost"
                  className="flex-1 text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  onClick={() => {
                    setActiveLabel("Custom")
                    setOpen(false)
                  }}
                >
                  Done
                </Button>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
