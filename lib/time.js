'use strict';

/**
 * Every date the app shows is in Indian Standard Time, whatever timezone the
 * host runs in. `toLocaleString('en-IN')` alone only sets the format; the zone
 * still comes from the server clock (UTC on Render/Railway), hence the
 * explicit timeZone here.
 */
const TIME_ZONE = 'Asia/Kolkata';

const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
});

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});

const yearFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TIME_ZONE, year: 'numeric' });

/** e.g. "29 Sept 2026, 04:35 pm IST" */
function formatDateTime(value) {
  return `${dateTimeFmt.format(new Date(value))} IST`;
}

/** e.g. "29 Sept 2026" */
function formatDate(value) {
  return dateFmt.format(new Date(value));
}

function currentYear() {
  return Number(yearFmt.format(new Date()));
}

module.exports = { TIME_ZONE, formatDateTime, formatDate, currentYear };
