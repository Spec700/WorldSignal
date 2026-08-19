# Priority Signals notices and attribution

Priority Signals is an independent open-source project. No data provider or referenced organization
endorses it. WorldSignal is a situational-awareness and exploration module, not an official
emergency-warning service. CredSignal is a local coordination module, not a credential-vault,
breach-feed, or notification-delivery service.

## Runtime libraries

- [Next.js](https://github.com/vercel/next.js) — MIT License
- [React](https://github.com/facebook/react) — MIT License
- [Globe.gl](https://github.com/vasturiano/globe.gl) / [React Globe.gl](https://github.com/vasturiano/react-globe.gl) — MIT License
- [Three.js](https://github.com/mrdoob/three.js) — MIT License
- [Zod](https://github.com/colinhacks/zod) — MIT License
- [Turf bbox](https://github.com/Turfjs/turf) — MIT License
- [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) — Apache License 2.0
- [node-postgres](https://github.com/brianc/node-postgres) — MIT License

The complete dependency graph and exact versions are recorded in `package-lock.json`.

Development and verification use Playwright (Apache License 2.0), TypeScript (Apache License 2.0),
Vitest (MIT), Testing Library (MIT), ESLint (MIT), and Prettier (MIT). These tools are not shipped as
application features.

## Fonts

- [Barlow Condensed](https://github.com/jpt/barlow) — SIL Open Font License 1.1
- [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next) — SIL Open Font License 1.1

The corresponding license texts are included with the self-hosted font files.

## Imagery and boundary data

- Earth imagery: [NASA Earth Observatory, Blue Marble](https://earthobservatory.nasa.gov/features/BlueMarble/BlueMarble.php)
- Boundary data: [Natural Earth 1:110m Admin 0 Countries](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/) ([public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/))

The bundled Earth texture is derived from NASA's December 2004 Blue Marble topography and
bathymetry image. The bundled boundary GeoJSON is from the Natural Earth Vector repository.

## Event data

- Earthquake data: [U.S. Geological Survey GeoJSON feeds](https://earthquake.usgs.gov/earthquakes/feed/)
- Disaster data: [Global Disaster Alert and Coordination System (GDACS) API](https://www.gdacs.org/gdacsapi/swagger/index.html) and [feed reference](https://data.gdacs.org/feed_reference.aspx)
- Preliminary U.S. tornado reports: [NOAA/NWS Storm Prediction Center storm reports](https://www.spc.noaa.gov/climo/reports/)

Source data remains subject to each provider's terms, limitations, and disclaimers. WorldSignal
preserves direct report links and source-native values and does not imply that derived display
priority is a provider-issued universal severity scale. SPC storm reports are preliminary and may be
revised during quality control. CredSignal ships only synthetic demonstration records and does not
redistribute a third-party breach dataset.
