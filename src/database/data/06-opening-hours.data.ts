// Opening hours seed — one row per day (0=Monday … 6=Sunday).
// hasMiddayBreak=true means split schedule: morningOpen→morningClose + afternoonOpen→afternoonClose.
export default [
  { dayOfWeek: 0, openTime: "09:00", closeTime: "18:00", isClosed: false, hasMiddayBreak: false, morningOpen: null, morningClose: null, afternoonOpen: null, afternoonClose: null },
  { dayOfWeek: 1, openTime: "09:00", closeTime: "18:00", isClosed: false, hasMiddayBreak: false, morningOpen: null, morningClose: null, afternoonOpen: null, afternoonClose: null },
  { dayOfWeek: 2, openTime: "09:00", closeTime: "18:00", isClosed: false, hasMiddayBreak: false, morningOpen: null, morningClose: null, afternoonOpen: null, afternoonClose: null },
  { dayOfWeek: 3, openTime: "09:00", closeTime: "18:00", isClosed: false, hasMiddayBreak: true, morningOpen: "09:00", morningClose: "12:00", afternoonOpen: "14:00", afternoonClose: "18:00" },
  { dayOfWeek: 4, openTime: "09:00", closeTime: "18:00", isClosed: false, hasMiddayBreak: false, morningOpen: null, morningClose: null, afternoonOpen: null, afternoonClose: null },
  { dayOfWeek: 5, openTime: "10:00", closeTime: "16:00", isClosed: false, hasMiddayBreak: false, morningOpen: null, morningClose: null, afternoonOpen: null, afternoonClose: null },
  { dayOfWeek: 6, openTime: null, closeTime: null, isClosed: true, hasMiddayBreak: false, morningOpen: null, morningClose: null, afternoonOpen: null, afternoonClose: null },
];
