#!/usr/bin/env bash
# Container start-up. This runs on EVERY boot — redeploy, crash-restart, scale
# event — so everything here must be safe to repeat.
set -euo pipefail

# The mounted volume. The database and every upload live on it, because the
# container filesystem is discarded on each deploy and those are the two things
# that must survive one.
DATA_DIR="${VERBO_DATA_DIR:-/data}"

mkdir -p "$DATA_DIR/storage/app/public" \
         "$DATA_DIR/storage/framework/cache/data" \
         "$DATA_DIR/storage/framework/sessions" \
         "$DATA_DIR/storage/framework/views" \
         "$DATA_DIR/storage/logs"

# `touch`, never `>` — truncating would wipe the database on every restart.
if [ ! -f "$DATA_DIR/database.sqlite" ]; then
  echo "[verbo] creating a fresh SQLite database at $DATA_DIR/database.sqlite"
  touch "$DATA_DIR/database.sqlite"
fi

# Point Laravel's writable trees at the volume. tessdata and dict stay in the
# image: they are build artefacts, not user data, and putting them on the volume
# would mean re-downloading 16MB into it on first boot.
for d in app/public framework/cache framework/sessions framework/views logs; do
  target="$DATA_DIR/storage/$d"
  link="/var/www/html/storage/$d"
  rm -rf "$link"
  mkdir -p "$(dirname "$link")"
  ln -s "$target" "$link"
done

chown -R www-data:www-data "$DATA_DIR" /var/www/html/storage /var/www/html/bootstrap/cache

cd /var/www/html

# public/storage -> storage/app/public, so uploaded images resolve. Forced
# because a symlink left from the previous container points nowhere.
php artisan storage:link --force || true

# --force skips the interactive confirmation that would hang a container with no
# TTY. Deliberately NOT `|| true`: a half-migrated schema is worse than a boot
# that stops and says so.
php artisan migrate --force

# Cached at boot rather than baked into the image. Baking would freeze whatever
# env vars existed at BUILD time, and every secret here is injected at RUN time.
php artisan config:cache
php artisan route:cache

# Railway assigns the port at run time, so Apache is pointed at it here rather
# than in the image.
sed -ri "s/^Listen [0-9]+/Listen ${PORT}/" /etc/apache2/ports.conf
sed -ri "s/<VirtualHost \*:[0-9]+>/<VirtualHost *:${PORT}>/" /etc/apache2/sites-available/000-default.conf

echo "[verbo] serving on ${PORT}"
exec apache2-foreground
