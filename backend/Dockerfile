# Verbo API.
#
# A real container rather than a serverless deploy, because three things this
# app does are incompatible with an ephemeral read-only filesystem: it keeps its
# database in a SQLite file, it stores uploads on disk, and it shells out to a
# Tesseract binary. All three are handled here, and the first two live on a
# mounted volume.
#
# Apache + mod_php rather than `php artisan serve`: the built-in PHP server is
# SINGLE-THREADED, and one page view in this app fans out to several API calls.
# Serialised behind one worker it would feel broken.
#
# PHP 8.2 rather than the 8.0 on the dev machine: Laravel 9 supports up to 8.2,
# composer.json already allows it (^8.0.2), and 8.0 is past end-of-life so it
# receives no security patches. Nothing here depends on 8.0 behaviour — the one
# version note in CLAUDE.md is about 8.0 LACKING string-keyed spread, which 8.2
# has.
FROM php:8.2-apache-bookworm

# - tesseract-ocr           the binary ScanController shells out to
#
#   AND ITS PATH HAS TO BE STATED. `config/ocr.php` defaults to the Windows
#   install the dev machine uses, so without this the container shells out to
#   `C:/Program Files/Tesseract-OCR/tesseract.exe`, the process fails, and
#   ScanController catches it and answers "Could not read that image" — for
#   EVERY upload, however clear. Scan could never work in production. The ENV
#   belongs in the image rather than in the service`s variables, because it is
#   a fact about this filesystem, not a deployment choice.
# - libzip/libicu           composer and Laravel's own requirements
# - sqlite3, libsqlite3-dev the database engine
# - libpng/jpeg/freetype    uploaded article, tutor and avatar images
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        ca-certificates \
        curl \
        git \
        unzip \
        libzip-dev \
        libicu-dev \
        libpng-dev \
        libjpeg62-turbo-dev \
        libfreetype6-dev \
        sqlite3 \
        libsqlite3-dev \
        libpq-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" pdo_sqlite pdo_pgsql zip intl gd \
    && rm -rf /var/lib/apt/lists/*

ENV TESSERACT_PATH=/usr/bin/tesseract

# pdo_pgsql is built even though the app ships on SQLite, so moving to Supabase
# Postgres later is a change of environment variables (DB_CONNECTION=pgsql plus
# the connection details) rather than a rebuild of the image. It costs a few MB
# and removes the one step that would otherwise block that migration.

# Upload limits. WITHOUT THIS the image runs on PHP's defaults —
# upload_max_filesize=2M and post_max_size=8M — which is far under what this app
# actually uploads: podcast audio runs to tens of megabytes, and classroom
# submissions and chat attachments are not small either. Nothing in the app
# would say why; a request over post_max_size arrives with $_POST and $_FILES
# EMPTY, so Laravel reports "the title field is required" for a file that is
# merely too big.
#
# post_max_size must stay ABOVE upload_max_filesize — it caps the whole request,
# text fields and multipart boundaries included, so setting them equal makes a
# file at exactly the upload limit fail on the total.
# Laravel's own `max:` rule on the audio field is the value the user sees; keep
# it below upload_max_filesize so the failure is a clean 422 with a readable
# message rather than a truncated request.
RUN { \
        echo 'upload_max_filesize=64M'; \
        echo 'post_max_size=72M'; \
        echo 'memory_limit=256M'; \
        echo 'max_execution_time=120'; \
    } > /usr/local/etc/php/conf.d/verbo-uploads.ini

# Laravel's front controller lives in public/, and its .htaccess needs
# AllowOverride to be honoured or every route but "/" returns 404.
ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
# Exactly one MPM may be loaded, and the apt install above leaves mpm_event
# enabled alongside the prefork that mod_php requires — Apache then refuses to
# start with "More than one MPM loaded" and the container crash-loops.
#
# The symlinks are removed directly rather than with `a2dismod mpm_event
# mpm_worker`: mpm_worker is not installed, so a2dismod aborts on the invalid
# argument WITHOUT disabling mpm_event, and a2enmod then happily adds prefork
# next to it. That failure is silent, which is how it reached production.
#
# The `test` at the end is the guard: exactly one MPM .load must remain, or the
# BUILD fails here rather than the container crash-looping after deploy.
RUN rm -f /etc/apache2/mods-enabled/mpm_event.* \
          /etc/apache2/mods-enabled/mpm_worker.* \
    && a2enmod mpm_prefork \
    && test "$(ls /etc/apache2/mods-enabled/ | grep -c 'mpm_.*\.load')" = "1" \
    && a2enmod rewrite \
    && sed -ri 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' \
        /etc/apache2/sites-available/*.conf \
    && sed -ri 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' \
        /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf \
    && printf '<Directory /var/www/html/public>\n    AllowOverride All\n    Require all granted\n</Directory>\n' \
        > /etc/apache2/conf-available/verbo.conf \
    && a2enconf verbo

# The Chinese language data is NOT bundled with Tesseract and is gitignored here
# (a large machine-fetched asset), so it is fetched at build time from the same
# tessdata_fast source the dev machine used. OcrService passes
# `--tessdata-dir storage/tessdata`, so it goes there rather than the system
# share.
RUN mkdir -p /var/www/html/storage/tessdata \
    && curl -fsSL -o /var/www/html/storage/tessdata/chi_sim.traineddata \
        https://github.com/tesseract-ocr/tessdata_fast/raw/main/chi_sim.traineddata \
    && curl -fsSL -o /var/www/html/storage/tessdata/eng.traineddata \
        https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata

# CC-CEDICT — the offline dictionary behind every translation and pinyin lookup
# in the app. Also gitignored and machine-fetched. Without it Scan, Read's
# hover-translation, Podcast and Study all lose their annotations.
# DictionaryService rebuilds its own PHP index from this on first use, so only
# the source .u8 is needed.
RUN mkdir -p /var/www/html/storage/dict \
    && curl -fsSL https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz \
        -o /tmp/cedict.gz \
    && gunzip -c /tmp/cedict.gz > /var/www/html/storage/dict/cedict_ts.u8 \
    && rm /tmp/cedict.gz

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Dependencies before source, so editing code does not re-resolve the whole
# tree on every deploy. --no-scripts because the artisan hooks need the app,
# which is not copied yet.
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --prefer-dist

COPY . .

RUN composer dump-autoload --optimize --no-dev \
    && chown -R www-data:www-data /var/www/html

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Railway injects PORT. The default matches for a plain `docker run`.
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
