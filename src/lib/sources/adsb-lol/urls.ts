const ADSB_LOL_API_ROOT = "https://api.adsb.lol/v2";
const VRS_ROUTE_ROOT = "https://vrs-standing-data.adsb.lol/routes";

export function getAdsbLolCallsignUrl(callsign: string): URL {
  return new URL(
    `${ADSB_LOL_API_ROOT}/callsign/${encodeURIComponent(callsign)}`,
  );
}

export function getAdsbLolIcaoUrl(aircraftIcaoHex: string): URL {
  return new URL(
    `${ADSB_LOL_API_ROOT}/icao/${encodeURIComponent(aircraftIcaoHex)}`,
  );
}

export function getVrsRouteUrl(callsign: string): URL {
  const prefix = callsign.slice(0, 2);
  return new URL(
    `${VRS_ROUTE_ROOT}/${encodeURIComponent(prefix)}/${encodeURIComponent(callsign)}.json`,
  );
}
