# JUWON — Portfolio

Portfolio site for JUWON (3D · AI · graphic designer). Content comes from the Notion page "JUWON's ARCHIVES" and is rebuilt hourly by GitHub Actions; see [docs/SETUP.ko.md](docs/SETUP.ko.md) for the one-time setup and [DESIGN.md](DESIGN.md) for the design system.

```bash
npm ci
NOTION_TOKEN=ntn_... npm run sync   # Notion → src/data/site.json + public/media
npm run dev                         # http://localhost:4321
npm test                            # unit tests (Notion mapping)
npm run e2e                         # page checks at desktop and phone sizes
```

`src/config.ts` holds site copy and switches (`showPhone`, English category names). Spec and plan live in `docs/superpowers/`.
