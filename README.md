# WorldSignal

WorldSignal is a local-first global situational-awareness dashboard. MVP-A focuses on authoritative
natural-hazard reporting from the U.S. Geological Survey and the Global Disaster Alert and
Coordination System.

> WorldSignal is not an official emergency-warning service. Always follow original authorities and
> local emergency guidance.

## Foundation status

The canonical event contract and deterministic fixture tests are in place. Live source adapters and
the operational interface are being implemented in subsequent verified phases.

## Prerequisites

- Node.js 24 LTS
- npm 11 or later

## Local commands

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm start
```

No account, API key, cloud database, deployment platform, or paid service is required for MVP-A.

## License

WorldSignal source code is available under the MIT License. Third-party data, imagery, fonts, and
libraries retain their own terms; see [NOTICE.md](NOTICE.md).
