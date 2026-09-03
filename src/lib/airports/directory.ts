import airports from "airport-data";

export interface AirportDirectoryEntry {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

const airportByIata = new Map(
  airports
    .filter(
      (airport) =>
        /^[A-Z]{3}$/.test(airport.iata) &&
        Number.isFinite(airport.latitude) &&
        Number.isFinite(airport.longitude),
    )
    .map((airport) => [
      airport.iata,
      {
        iata: airport.iata,
        icao: airport.icao,
        name: airport.name,
        city: airport.city,
        country: airport.country,
        latitude: airport.latitude,
        longitude: airport.longitude,
        ...(airport.tz && airport.tz !== "\\N" ? { timezone: airport.tz } : {}),
      } satisfies AirportDirectoryEntry,
    ]),
);

export function findAirportByIata(
  iata: string | undefined,
): AirportDirectoryEntry | undefined {
  return iata ? airportByIata.get(iata.trim().toUpperCase()) : undefined;
}
