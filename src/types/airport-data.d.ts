declare module "airport-data" {
  interface AirportDataRecord {
    id: number;
    name: string;
    city: string;
    country: string;
    iata: string;
    icao: string;
    latitude: number;
    longitude: number;
    altitude: number;
    timezone: number | string;
    dst: string;
    tz: string;
    type: string;
    source: string;
  }

  const airports: AirportDataRecord[];
  export default airports;
}
