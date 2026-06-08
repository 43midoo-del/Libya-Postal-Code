# Architecture

Libya Postal Code is a plain-PHP MVC web app with no framework dependency.

## Layers

| Layer | Path | Responsibility |
|--------|------|----------------|
| Front controller | `index.php` | Route dispatch via `?r=` |
| Controllers | `controllers/` | HTTP handling, auth checks |
| Models | `models/` | PDO queries and domain logic |
| Views | `views/` | Arabic RTL templates |
| Services | `includes/` | DB, auth, CSRF, postal code, geo |
| Config | `config/` | App, DB, map, admin regions |
| Assets | `css/`, `js/`, `public/` | Styles, Leaflet UI, PWA shell |
| Data | `data/` | GeoJSON boundaries and cities |
| Database | `database/` | Schema, seeds, migrations |
| Scripts | `scripts/` | Seeding and GeoJSON builders |
| Tools | `tools/` | One-off maintenance utilities |

## Routing

All pages use `index.php?r=<route>`. JSON APIs use the same entry point with `Content-Type: application/json`.

Key route groups: auth, users, addresses, postal lookup, admin geo/boundary, tile sync, dashboard.

## Postal code format

Five-part code aligned with Libyan admin hierarchy, e.g. `B 2-1-S 9` (state, shabiya, sector, property).

## Security model

- Session-based auth (`SessionAuth`)
- CSRF tokens on mutating forms
- Role gates: `admin`, `employee`, `citizen`
- Citizens can only view/edit/delete their own addresses

See [README](../README.md) for the full route table.
