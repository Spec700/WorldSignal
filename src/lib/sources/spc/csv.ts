import { SourceFetchError } from "@/lib/sources/errors";

const EXPECTED_HEADER = [
  "Time",
  "F_Scale",
  "Location",
  "County",
  "State",
  "Lat",
  "Lon",
  "Comments",
] as const;

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];

    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new SourceFetchError(
          "schema",
          "NOAA SPC returned malformed tornado-report CSV.",
        );
      }
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new SourceFetchError(
      "schema",
      "NOAA SPC returned malformed tornado-report CSV.",
    );
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

export function parseSpcTornadoCsv(csv: string): string[][] {
  const rows = parseCsvRows(csv.replace(/^\uFEFF/, ""));
  const header = rows.shift();

  if (
    !header ||
    header.length !== EXPECTED_HEADER.length ||
    !EXPECTED_HEADER.every((column, index) => header[index]?.trim() === column)
  ) {
    throw new SourceFetchError(
      "schema",
      "NOAA SPC returned tornado data with an unexpected CSV header.",
    );
  }

  const dataRows = rows.filter((row) =>
    row.some((field) => field.trim().length > 0),
  );
  if (dataRows.some((row) => row.length !== EXPECTED_HEADER.length)) {
    throw new SourceFetchError(
      "schema",
      "NOAA SPC returned a malformed tornado-report row.",
    );
  }

  return dataRows;
}
