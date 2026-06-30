import * as React from "react";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DateRangePreset = 
  | "today" 
  | "yesterday" 
  | "last7days" 
  | "last30days" 
  | "thisMonth" 
  | "lastMonth" 
  | "thisYear" 
  | "custom";

interface DateRangePickerProps {
  className?: string;
  onRangeChange: (range: { from: Date; to: Date }, preset: DateRangePreset) => void;
  initialPreset?: DateRangePreset;
  initialRange?: { from: Date; to: Date };
}

export function DateRangePicker({
  className,
  onRangeChange,
  initialPreset = "last7days",
  initialRange,
}: DateRangePickerProps) {
  const [date, setDate] = React.useState<DateRange | undefined>(initialRange);
  const [preset, setPreset] = React.useState<DateRangePreset>(initialPreset);

  const getRangeFromPreset = (p: DateRangePreset): { from: Date; to: Date } => {
    const now = new Date();
    switch (p) {
      case "today":
        return { from: startOfDay(now), to: endOfDay(now) };
      case "yesterday":
        const yesterday = subDays(now, 1);
        return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
      case "last7days":
        return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
      case "last30days":
        return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
      case "thisMonth":
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case "lastMonth":
        const lastMonth = subMonths(now, 1);
        return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
      case "thisYear":
        return { from: startOfYear(now), to: endOfYear(now) };
      case "custom":
        return initialRange || { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
      default:
        return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    }
  };

  const handlePresetChange = (value: string) => {
    const newPreset = value as DateRangePreset;
    setPreset(newPreset);
    if (newPreset !== "custom") {
      const range = getRangeFromPreset(newPreset);
      setDate({ from: range.from, to: range.to });
      onRangeChange(range, newPreset);
    }
  };

  const handleCalendarSelect = (newDate: DateRange | undefined) => {
    setDate(newDate);
    if (newDate?.from && newDate?.to) {
      onRangeChange({ from: startOfDay(newDate.from), to: endOfDay(newDate.to) }, "custom");
    }
  };

  return (
    <div className={cn("flex flex-col sm:flex-row gap-2", className)}>
      <Select value={preset} onValueChange={handlePresetChange}>
        <SelectTrigger className="w-full sm:w-[180px] bg-white dark:bg-slate-900">
          <SelectValue placeholder="Selecione o período" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Hoje</SelectItem>
          <SelectItem value="yesterday">Ontem</SelectItem>
          <SelectItem value="last7days">Últimos 7 dias</SelectItem>
          <SelectItem value="last30days">Últimos 30 dias</SelectItem>
          <SelectItem value="thisMonth">Este mês</SelectItem>
          <SelectItem value="lastMonth">Mês passado</SelectItem>
          <SelectItem value="thisYear">Este ano</SelectItem>
          <SelectItem value="custom">Personalizado</SelectItem>
        </SelectContent>
      </Select>

      <div className={cn("grid gap-2", preset !== "custom" && "hidden lg:grid")}>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id="date"
              variant={"outline"}
              className={cn(
                "w-full sm:w-[260px] justify-start text-left font-normal bg-white dark:bg-slate-900",
                !date && "text-muted-foreground"
              )}
              disabled={preset !== "custom"}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date?.from ? (
                date.to ? (
                  <>
                    {format(date.from, "dd/MM/yyyy")} -{" "}
                    {format(date.to, "dd/MM/yyyy")}
                  </>
                ) : (
                  format(date.from, "dd/MM/yyyy")
                )
              ) : (
                <span>Selecione uma data</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={handleCalendarSelect}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
