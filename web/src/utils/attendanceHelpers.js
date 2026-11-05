import { getCachedPolicies, getCachedHolidays } from "../api";

export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const WEEKDAY_LABELS = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

export const GRACE_MINUTES = 20;
export const EXTREME_LATE_AFTER_GRACE_MINUTES = 30;
export const FREE_OFFS_PER_MONTH = 2;

// Rules (Defaults — overridden dynamically by Company Policies from DB)
export const LATES_PER_OFF = 3;         // default: 3 Late = 1 Off
export const EXTREME_LATES_PER_OFF = 0; // default: 0 (No Off counted on Extreme Late unless set by Admin)
export const EARLY_LEAVES_PER_OFF = 0;  // default: 0 (No Off counted on Early Leave unless set by Admin)

export function getActivePolicies(override = null) {
  const cached = getCachedPolicies();
  const merged = { ...cached, ...(override || {}) };
  return {
    companyName: merged.companyName || "The Nexus Group Co",
    graceMinutes: Math.max(0, Number(merged.graceMinutes ?? GRACE_MINUTES)),
    extremeLateAfterGraceMinutes: Math.max(
      0,
      Number(merged.extremeLateAfterGraceMinutes ?? EXTREME_LATE_AFTER_GRACE_MINUTES)
    ),
    latesPerOff: Math.max(0, Number(merged.latesPerOff ?? LATES_PER_OFF)),
    extremeLatesPerOff: Math.max(
      0,
      Number(merged.extremeLatesPerOff ?? EXTREME_LATES_PER_OFF)
    ),
    earlyLeavesPerOff: Math.max(
      0,
      Number(merged.earlyLeavesPerOff ?? EARLY_LEAVES_PER_OFF)
    ),
    freeOffsPerMonth: Math.max(
      0,
      Number(merged.freeOffsPerMonth ?? FREE_OFFS_PER_MONTH)
    ),
  };
}

export function getActiveHolidayMap(holidaysOverride = null) {
  const list = Array.isArray(holidaysOverride)
    ? holidaysOverride
    : getCachedHolidays();
  const map = new Map();
  for (const h of list) {
    if (h?.date) {
      map.set(h.date, h.reason || "Official Off");
    }
  }
  return map;
}

const MAX_LEAVE_RANGE_DAYS = 366;

export function getWeekdayKey(date = new Date()) {
  return WEEKDAY_KEYS[date.getDay()];
}

export function isScheduledWorkday(schedule, date = new Date()) {
  const key = getWeekdayKey(date);
  if (key === "sun") return false; // Sunday is always Weekly Off
  return Boolean(schedule?.[key]);
}

export function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

export function getLocalMonthStr(date = new Date()) {
  return getLocalDateStr(date).slice(0, 7);
}

export function formatTime12(date) {
  if (!date) return "—";

  const parsedDate =
    date instanceof Date ? date : date?.toDate?.() ?? new Date(date);

  if (Number.isNaN(parsedDate.getTime())) return "—";

  return parsedDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// "09:00", "9:00 AM", "09:00:00", "5:30 pm" sab samajhta hai
export function parseScheduleTime(value) {
  if (!value || typeof value !== "string") return null;

  const match = value
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!match) return null;

  let h = Number(match[1]);
  const min = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();

  if (meridiem) {
    if (h < 1 || h > 12) return null;
    if (meridiem === "PM" && h !== 12) h += 12;
    if (meridiem === "AM" && h === 12) h = 0;
  }

  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

export function calculateAttendanceStatus(
  schedule,
  checkInDate = new Date(),
  policyOverride = null
) {
  const activePolicy = getActivePolicies(policyOverride);
  const weekdayKey = getWeekdayKey(checkInDate);
  const rawTime = schedule?.[weekdayKey];

  // Schedule mein is din ka time nahi hai (off day)
  if (!rawTime) {
    return { status: "on-time", lateMinutes: 0, weekdayKey };
  }

  const parsed = parseScheduleTime(rawTime);
  if (!parsed) {
    console.warn("Schedule time parse nahi hua:", rawTime, weekdayKey);
    return { status: "unscheduled", lateMinutes: 0, weekdayKey };
  }

  const expectedDate = new Date(checkInDate);
  expectedDate.setHours(parsed.h, parsed.m, 0, 0);

  const graceDate = new Date(
    expectedDate.getTime() + activePolicy.graceMinutes * 60000
  );

  if (checkInDate <= graceDate) {
    return { status: "on-time", lateMinutes: 0, weekdayKey };
  }

  const lateMinutes = Math.round(
    (checkInDate.getTime() - graceDate.getTime()) / 60000
  );

  const status =
    lateMinutes > activePolicy.extremeLateAfterGraceMinutes
      ? "extreme-late"
      : "late";

  return { status, lateMinutes, weekdayKey };
}

export function statusLabel(record) {
  if (record?.status === "unscheduled") {
    return "Schedule Missing";
  }

  if (record?.status === "extreme-late") {
    return `Extreme Late (${record.lateMinutes ?? 0} min)`;
  }

  if (record?.status === "late") {
    return `Late (${record.lateMinutes ?? 0} min)`;
  }

  return "On time";
}

export function countWorkingDaysSoFar(schedule, referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const todayDate = referenceDate.getDate();

  let count = 0;

  for (let day = 1; day <= todayDate; day += 1) {
    const date = new Date(year, month, day);

    if (isScheduledWorkday(schedule, date)) {
      count += 1;
    }
  }

  return count;
}

export function countWorkingDaysInMonth(
  schedule,
  monthStr = getLocalMonthStr()
) {
  const [year, month] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  let count = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month - 1, day);

    if (isScheduledWorkday(schedule, date)) {
      count += 1;
    }
  }

  return count;
}

function isValidDateString(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = parseLocalDate(value);
  return getLocalDateStr(date) === value;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Returns scheduled work dates covered by approved full-day leave.
 */
export function getApprovedLeaveDates(schedule, approvedLeaves = []) {
  const leaveDates = new Set();

  for (const leave of approvedLeaves) {
    if (leave?.status !== "approved") continue;
    if (String(leave?.type || "").toLowerCase() !== "leave") continue;

    if (Array.isArray(leave.dates) && leave.dates.length > 0) {
      for (const dateString of leave.dates) {
        if (!isValidDateString(dateString)) continue;

        const date = parseLocalDate(dateString);

        if (isScheduledWorkday(schedule, date)) {
          leaveDates.add(dateString);
        }
      }

      continue;
    }

    if (!leave.startDate || !leave.endDate) continue;
    if (!isValidDateString(leave.startDate)) continue;
    if (!isValidDateString(leave.endDate)) continue;
    if (leave.endDate < leave.startDate) continue;

    const cursor = parseLocalDate(leave.startDate);
    const endDate = parseLocalDate(leave.endDate);

    let guard = 0;

    while (cursor <= endDate && guard < MAX_LEAVE_RANGE_DAYS) {
      if (isScheduledWorkday(schedule, cursor)) {
        leaveDates.add(getLocalDateStr(cursor));
      }

      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
  }

  return leaveDates;
}

// Early Leaves ki date nikalne ka function
export function getApprovedEarlyLeaveDates(schedule, approvedLeaves = []) {
  const earlyDates = new Set();

  for (const leave of approvedLeaves) {
    if (leave?.status !== "approved") continue;
    if (String(leave?.type || "").toLowerCase() !== "earlyleave") continue;

    if (leave.date && isValidDateString(leave.date)) {
      const d = parseLocalDate(leave.date);
      if (isScheduledWorkday(schedule, d)) {
        earlyDates.add(getLocalDateStr(d));
      }
    }
  }

  return earlyDates;
}

function getReferenceDateForMonth(monthStr) {
  const currentMonth = getLocalMonthStr();

  if (monthStr === currentMonth) return new Date();
  if (monthStr > currentMonth) return null;

  const [year, month] = monthStr.split("-").map(Number);
  return new Date(year, month, 0);
}

function getScheduledDatesUpTo(schedule, monthStr, referenceDate) {
  if (!referenceDate) return [];

  const [year, month] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const referenceStr = getLocalDateStr(referenceDate);

  const dates = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month - 1, day);
    const dateStr = getLocalDateStr(date);

    if (dateStr > referenceStr) break;

    if (isScheduledWorkday(schedule, date)) {
      dates.push(dateStr);
    }
  }

  return dates;
}

export function calculateSalaryStats({
  records = [],
  schedule,
  baseSalary = 0,
  month = getLocalMonthStr(),
  approvedLeaves = [],
  policies = null,
  holidays = null,
}) {
  const activePolicy = getActivePolicies(policies);
  const holidayMap = getActiveHolidayMap(holidays);
  const todayStr = getLocalDateStr();

  const monthStr =
    typeof month === "string" && /^\d{4}-\d{2}$/.test(month)
      ? month
      : getLocalMonthStr();

  const base = Number(baseSalary) || 0;

  const presentCount = records.length;

  const onTimeCount = records.filter(
    (record) => !record.status || record.status === "on-time"
  ).length;

  const lateCount = records.filter(
    (record) => record.status === "late"
  ).length;

  const extremeLateCount = records.filter(
    (record) => record.status === "extreme-late"
  ).length;

  const unscheduledCount = records.filter(
    (record) => record.status === "unscheduled"
  ).length;

  const scheduledDates = getScheduledDatesUpTo(
    schedule,
    monthStr,
    getReferenceDateForMonth(monthStr)
  );

  const presentDates = new Set(
    records.map((record) => record.date).filter(Boolean)
  );

  const approvedLeaveDates = getApprovedLeaveDates(schedule, approvedLeaves);
  const approvedEarlyLeaveDates = getApprovedEarlyLeaveDates(schedule, approvedLeaves);

  let absentCount = 0;
  let approvedLeaveCount = 0;
  let earlyLeaveCount = 0;
  let officialHolidayCount = 0;

  for (const dateStr of scheduledDates) {
    if (presentDates.has(dateStr)) {
      if (approvedEarlyLeaveDates.has(dateStr)) {
        earlyLeaveCount += 1;
      }
      continue;
    }

    // Admin declared official off / holiday -> Exempt (not absent)
    if (holidayMap.has(dateStr)) {
      officialHolidayCount += 1;
      continue;
    }

    if (approvedLeaveDates.has(dateStr)) {
      approvedLeaveCount += 1;
      continue;
    }

    // Do NOT count today as an Unapproved Absence while today is still in progress
    if (dateStr === todayStr) {
      continue;
    }

    absentCount += 1;
  }

  const workingDaysSoFar = scheduledDates.length;

  // Dynamic policy calculations (if policy value is 0, no off is counted)
  const offFromLates =
    activePolicy.latesPerOff > 0
      ? Math.floor(lateCount / activePolicy.latesPerOff)
      : 0;
  const offFromExtremeLates =
    activePolicy.extremeLatesPerOff > 0
      ? Math.floor(extremeLateCount / activePolicy.extremeLatesPerOff)
      : 0;
  const offFromEarlyLeaves =
    activePolicy.earlyLeavesPerOff > 0
      ? Math.floor(earlyLeaveCount / activePolicy.earlyLeavesPerOff)
      : 0;

  // Total off equivalents calculation
  const offEquivalents =
    offFromExtremeLates + absentCount + offFromLates + offFromEarlyLeaves;

  const deductibleOffs = Math.max(
    offEquivalents - activePolicy.freeOffsPerMonth,
    0
  );

  const workingDaysInMonth = countWorkingDaysInMonth(schedule, monthStr);

  const perDayRate = workingDaysInMonth > 0 ? base / workingDaysInMonth : 0;

  // Detailed deduction breakdown
  const absentDeductionGross = absentCount * perDayRate;
  const lateDeductionGross = (offFromLates + offFromExtremeLates) * perDayRate;
  const earlyLeaveDeductionGross = offFromEarlyLeaves * perDayRate;
  const freeOffCredit =
    Math.min(offEquivalents, activePolicy.freeOffsPerMonth) * perDayRate;

  const deduction = deductibleOffs * perDayRate;
  const netSalary = Math.max(base - deduction, 0);

  return {
    baseSalary: base,
    presentCount,
    onTimeCount,
    lateCount,
    extremeLateCount,
    unscheduledCount,
    absentCount,
    approvedLeaveCount,
    officialHolidayCount,
    earlyLeaveCount,
    offFromLates,
    offFromExtremeLates,
    offFromEarlyLeaves,
    offEquivalents,
    freeOffsAllowed: activePolicy.freeOffsPerMonth,
    latesPerOff: activePolicy.latesPerOff,
    extremeLatesPerOff: activePolicy.extremeLatesPerOff,
    earlyLeavesPerOff: activePolicy.earlyLeavesPerOff,
    graceMinutes: activePolicy.graceMinutes,
    extremeLateAfterGraceMinutes: activePolicy.extremeLateAfterGraceMinutes,
    deductibleOffs,
    perDayRate,
    absentDeductionGross,
    lateDeductionGross,
    earlyLeaveDeductionGross,
    freeOffCredit,
    deduction,
    netSalary,
    workingDaysInMonth,
    workingDaysSoFar,
  };
}

export const digitsOnly = (s = "") => String(s).replace(/\D/g, "");

export function formatCnic(value) {
  const d = digitsOnly(value).slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export function isValidCnic(value) {
  const d = digitsOnly(value);
  return d.length === 13 && d[0] !== "0";
}

export function normalizePkMobile(value) {
  let d = digitsOnly(value);
  if (d.startsWith("92") && d.length === 12) d = "0" + d.slice(2);
  if (!/^03\d{9}$/.test(d)) return null;
  return `${d.slice(0, 4)}-${d.slice(4)}`;
}

export function isValidIban(value) {
  const iban = String(value).replace(/\s+/g, "").toUpperCase();
  if (!/^PK\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));

  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}

export function isValidDob(value, minAge = 16) {
  if (!value) return false;
  const dob = new Date(value + "T00:00:00");
  if (Number.isNaN(dob.getTime())) return false;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;

  return age >= minAge && age <= 90;
}