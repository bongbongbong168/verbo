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

# One-shot publish of the bundled content library (database/content/), OFF
# unless CONTENT_IMPORT=1 is set on the service.
#
# It has to run HERE rather than through `railway run`, and the reason is not
# convenience: `railway run` executes on the operator's own machine with these
# env vars injected, so the rows would reach Postgres while the 34 images went
# to their laptop's disk — leaving production with covers that 404. In here,
# both land in the right place, because storage/app/public is already symlinked
# onto the mounted volume by the block above.
#
# Gated rather than unconditional because the import upserts by id: left on, a
# redeploy would quietly revert anything edited through the admin UI in
# production. Set it, deploy once, then remove the variable.
#
# `|| echo` is load-bearing under `set -e`. A refusal — no admin account to own
# the content, say — must never take the whole site down with it; the API is
# more important than the library, and an empty shelf is recoverable while a
# crash-looping container is not.
if [ "${CONTENT_IMPORT:-0}" = "1" ]; then
  echo "[verbo] CONTENT_IMPORT=1 — importing the bundled content library"
  if [ -n "${CONTENT_OWNER:-}" ]; then
    php artisan content:import --owner="${CONTENT_OWNER}" \
      || echo "[verbo] content import did not complete; continuing boot"
  else
    php artisan content:import \
      || echo "[verbo] content import did not complete; continuing boot"
  fi
fi

# Railway assigns the port at run time, so Apache is pointed at it here rather
# than in the image.
sed -ri "s/^Listen [0-9]+/Listen ${PORT}/" /etc/apache2/ports.conf
sed -ri "s/<VirtualHost \*:[0-9]+>/<VirtualHost *:${PORT}>/" /etc/apache2/sites-available/000-default.conf

# Exactly one MPM may be loaded or Apache refuses to start ("More than one MPM
# loaded") and the container crash-loops. The base image ships mpm_prefork,
# which mod_php requires, but the apt layer leaves mpm_event enabled too.
#
# Done HERE rather than only in the Dockerfile because the build layer that
# fixes it can be served from cache, and a cached layer silently reintroduced
# the broken state on three consecutive deploys. Start-up state is the thing
# that actually matters, so it is asserted at start-up: idempotent, and immune
# to whatever the builder decided to reuse.
rm -f /etc/apache2/mods-enabled/mpm_event.* \
      /etc/apache2/mods-enabled/mpm_worker.*
a2enmod mpm_prefork >/dev/null 2>&1 || true

mpm_count="$(find /etc/apache2/mods-enabled -name 'mpm_*.load' | wc -l)"
echo "[verbo] MPM modules loaded: ${mpm_count} ($(find /etc/apache2/mods-enabled -name 'mpm_*.load' -printf '%f '))"
if [ "$mpm_count" != "1" ]; then
  echo "[verbo] FATAL: expected exactly one MPM, found ${mpm_count}" >&2
  exit 1
fi

echo "[verbo] serving on ${PORT}"
exec apache2-foreground
