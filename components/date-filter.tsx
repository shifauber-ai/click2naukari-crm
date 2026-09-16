"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type DatePreset, type DateRange, getPresetRange } from "@/lib/employee-filters";
import { Calendar } from "lucide-react";

interface DateFilterProps {
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  columnLabel?: string;
}

export function DateFilter({ range, onRangeChange }: DateFilterProps) {
  const [preset, setPreset] = useState<DatePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const handlePresetChange = (value: string) => {
    const p = value as DatePreset;
    setPreset(p);
    if (p !== "custom") {
      onRangeChange(getPresetRange(p));
    }
  };

  const handleApplyCustom = () => {
    if (!customStart && !customEnd) return;
    const start = customStart ? new Date(customStart).toISOString() : null;
    const end = customEnd ? new Date(customEnd + "T23:59:59").toISOString() : null;
    onRangeChange({ start, end });
  };

  const handleClear = () => {
    setPreset("all");
    setCustomStart("");
    setCustomEnd("");
    onRangeChange({ start: null, end: null });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={handlePresetChange}>
        <SelectTrigger className="w-[140px] border-slate-200">
          <Calendar className="mr-1 h-3.5 w-3.5 text-slate-400" />
          <SelectValue placeholder="Date" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Dates</SelectItem>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="yesterday">Yesterday</SelectItem>
          <SelectItem value="this_week">This Week</SelectItem>
          <SelectItem value="this_month">This Month</SelectItem>
          <SelectItem value="custom">Custom Range</SelectItem>
        </SelectContent>
      </Select>
      {preset === "custom" && (
        <>
          <Input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="w-[140px] border-slate-200"
            placeholder="Start"
          />
          <Input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="w-[140px] border-slate-200"
            placeholder="End"
          />
          <Button size="sm" variant="default" onClick={handleApplyCustom} className="bg-blue-600 hover:bg-blue-700">
            Apply
          </Button>
        </>
      )}
      {(range.start || range.end) && (
        <Button size="sm" variant="ghost" onClick={handleClear} className="text-slate-500">
          Clear
        </Button>
      )}
    </div>
  );
}
