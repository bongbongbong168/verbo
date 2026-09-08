<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Evidence attached to a tutor application — a certificate, a degree, a
 * reference letter.
 *
 * This is what separates verification from a form. Anyone can type "HSK 6
 * certified"; the point of a review step is that somebody looked at something.
 *
 * ON THE PRIVATE DISK, never `public`. A qualification document carries a real
 * name, an institution and often a date of birth, and a public URL is readable
 * by anyone who ever obtains it with no way to revoke — the same rule chat
 * attachments and classroom submissions already follow here.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::create('tutor_credentials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tutor_profile_id')->constrained()->cascadeOnDelete();
            $table->string('path');
            $table->string('name');
            $table->string('mime')->nullable();
            $table->unsignedInteger('size')->nullable();
            /* What the applicant says this document is ("HSK 6 certificate"),
               since a filename is routinely `scan_0001.pdf`. */
            $table->string('label', 120)->nullable();
            $table->timestamps();

            $table->index('tutor_profile_id');
        });
    }

    public function down()
    {
        Schema::dropIfExists('tutor_credentials');
    }
};
