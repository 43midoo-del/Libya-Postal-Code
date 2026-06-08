# Deployment

## Local (XAMPP / PHP built-in server)

1. Clone the repository.
2. Import SQL files — see [database/README.md](../database/README.md).
3. Copy `config/database.example.php` to `config/database.php` and set credentials.
4. Run:

```bash
php -S 127.0.0.1:8080 -t .
```

Or double-click `run-server.bat` on Windows.

5. Open `http://127.0.0.1:8080/index.php?r=login`.

## Apache (production)

- Point the virtual host document root to the project root (where `index.php` lives).
- Enable `mod_rewrite` if you add pretty URLs later; `.htaccess` is included.
- Set `APP_DEBUG=0` and use a strong MySQL password.
- Change the default admin password immediately.

## Offline map tiles (optional)

```bash
php scripts/seed_mbtiles_from_osm.php 5 7
```

Tiles are stored in `data/tiles/libya.mbtiles` (gitignored; generated per environment).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DB_PASSWORD` | MySQL password (overrides `config/database.php`) |
| `APP_DEBUG` | Set to `1` for verbose errors |
