const SPC_REPORT_ROOT = "https://www.spc.noaa.gov/climo/reports";

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

export function getSpcReportKey(reportDate: Date): string {
  return `${pad(reportDate.getUTCFullYear() % 100)}${pad(reportDate.getUTCMonth() + 1)}${pad(reportDate.getUTCDate())}`;
}

export function getSpcReportDate(timestamp: Date): Date {
  const reportDate = new Date(
    Date.UTC(
      timestamp.getUTCFullYear(),
      timestamp.getUTCMonth(),
      timestamp.getUTCDate(),
    ),
  );

  if (timestamp.getUTCHours() < 12) {
    reportDate.setUTCDate(reportDate.getUTCDate() - 1);
  }

  return reportDate;
}

export function getSpcReportDates(from: Date, to: Date): Date[] {
  if (from > to) {
    throw new RangeError("SPC report range start must not follow its end");
  }

  const start = getSpcReportDate(from);
  const end = getSpcReportDate(to);
  const dates: Date[] = [];

  for (
    let cursor = start;
    cursor <= end;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1_000)
  ) {
    dates.push(cursor);
  }

  return dates;
}

export function getSpcTornadoCsvUrl(reportDate: Date): URL {
  return new URL(
    `${SPC_REPORT_ROOT}/${getSpcReportKey(reportDate)}_rpts_filtered_torn.csv`,
  );
}

export function getSpcDailyReportUrl(reportDate: Date): string {
  return `${SPC_REPORT_ROOT}/${getSpcReportKey(reportDate)}_rpts.html`;
}
