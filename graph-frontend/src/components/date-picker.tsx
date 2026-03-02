import { useState } from "react"
import { addDays, addMonths, addYears, differenceInCalendarDays, format } from "date-fns"
import { Calendar as CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { type DateRange } from "react-day-picker"

import { cn } from "#/lib/utils"
import { Button } from "#/components/ui/button"
import { Calendar } from "#/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover"

const PRESETS = [
  { label: "Past 2 days", range: () => ({ from: addDays(new Date(), -2), to: new Date() }) },
  { label: "Past week", range: () => ({ from: addDays(new Date(), -7), to: new Date() }) },
  { label: "Past month", range: () => ({ from: addMonths(new Date(), -1), to: new Date() }) },
  { label: "Past 3 months", range: () => ({ from: addMonths(new Date(), -3), to: new Date() }) },
  { label: "Past year", range: () => ({ from: addYears(new Date(), -1), to: new Date() }) },
] as const

interface DatePickerProps {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  /** Sorted array of all unique play date strings (YYYY-MM-DD) across the graph. */
  allPlayDays: string[]
}

function formatRange(range: DateRange | undefined): string {
  if (!range?.from) return "All time"
  if (!range.to) return format(range.from, "LLL dd, y")
  return `${format(range.from, "LLL dd, y")} - ${format(range.to, "LLL dd, y")}`
}

/** Convert a YYYY-MM-DD string to a Date (local midnight). */
function dayToDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function DatePicker({ dateRange, onDateRangeChange, allPlayDays }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)

  function jumpToNextPlay() {
    if (!dateRange?.from || allPlayDays.length === 0) {
      // No range — jump to the latest play date
      if (allPlayDays.length > 0) {
        const d = dayToDate(allPlayDays[allPlayDays.length - 1])
        onDateRangeChange({ from: d, to: d })
      }
      return
    }

    const rangeDuration = differenceInCalendarDays(dateRange.to ?? dateRange.from, dateRange.from)
    const currentTo = toDay(dateRange.to ?? dateRange.from)

    // Find the first play day strictly after the current range end
    const nextDay = allPlayDays.find((d) => d > currentTo)
    if (!nextDay) return // already at the latest

    const newFrom = dayToDate(nextDay)
    onDateRangeChange({ from: newFrom, to: addDays(newFrom, rangeDuration) })
  }

  function jumpToPrevPlay() {
    if (!dateRange?.from || allPlayDays.length === 0) {
      // No range — jump to the earliest play date
      if (allPlayDays.length > 0) {
        const d = dayToDate(allPlayDays[0])
        onDateRangeChange({ from: d, to: d })
      }
      return
    }

    const rangeDuration = differenceInCalendarDays(dateRange.to ?? dateRange.from, dateRange.from)
    const currentFrom = toDay(dateRange.from)

    // Find the last play day strictly before the current range start
    let prevDay: string | undefined
    for (let i = allPlayDays.length - 1; i >= 0; i--) {
      if (allPlayDays[i] < currentFrom) {
        prevDay = allPlayDays[i]
        break
      }
    }
    if (!prevDay) return // already at the earliest

    const newTo = dayToDate(prevDay)
    const newFrom = addDays(newTo, -rangeDuration)
    onDateRangeChange({ from: newFrom, to: newTo })
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="bg-neutral-900 border-neutral-700 text-white hover:bg-neutral-800 hover:text-white"
        onClick={jumpToPrevPlay}
      >
        <ChevronLeftIcon className="size-4" />
      </Button>
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowCalendar(false) }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-[280px] justify-start text-left font-normal",
              "bg-neutral-900 border-neutral-700 text-white hover:bg-neutral-800 hover:text-white",
              !dateRange && "text-neutral-400",
            )}
          >
            <CalendarIcon className="size-4" />
            {formatRange(dateRange)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-neutral-900 border-neutral-700" align="start">
          {!showCalendar ? (
            <div className="flex flex-col p-2 gap-1">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  className="justify-start text-white hover:bg-neutral-800"
                  onClick={() => {
                    onDateRangeChange(preset.range())
                    setOpen(false)
                  }}
                >
                  {preset.label}
                </Button>
              ))}
              <Button
                variant="ghost"
                className="justify-start text-neutral-400 hover:text-white hover:bg-neutral-800"
                onClick={() => {
                  onDateRangeChange(undefined)
                  setOpen(false)
                }}
              >
                All time
              </Button>
              <div className="border-t border-neutral-700 my-1" />
              <Button
                variant="ghost"
                className="justify-start text-neutral-400 hover:text-white hover:bg-neutral-800"
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
                onSelect={onDateRangeChange}
                numberOfMonths={2}
                className="bg-neutral-900 text-white"
              />
              {dateRange && (
                <div className="p-2 border-t border-neutral-700">
                  <Button
                    variant="ghost"
                    className="w-full text-neutral-400 hover:text-white hover:bg-neutral-800"
                    onClick={() => {
                      onDateRangeChange(undefined)
                      setOpen(false)
                    }}
                  >
                    Reset to all time
                  </Button>
                </div>
              )}
            </>
          )}
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="icon"
        className="bg-neutral-900 border-neutral-700 text-white hover:bg-neutral-800 hover:text-white"
        onClick={jumpToNextPlay}
      >
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  )
}
