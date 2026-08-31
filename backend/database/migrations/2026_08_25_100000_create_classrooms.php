<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The tutor portal: classrooms, their roster, their curriculum, and student
 * submissions.
 *
 * Deliberately SEPARATE from `courses`. A course is a sellable product — it has
 * a price, a capacity, enrolment holds and a checkout. A classroom is a
 * teaching container with a room, a term, a join code and attendance. Folding
 * one into the other would leave both carrying columns that make no sense for
 * half their rows.
 *
 * The whole point of the portal is here: a submission is bound to
 * (classroom, item, student) by foreign key, so a file called
 * "final_final_REAL.docx" is still unambiguously that student's work for that
 * assignment. The filename never has to be trusted.
 */
return new class extends Migration
{
    public function up()
    {
        Schema::create('classrooms', function (Blueprint $table) {
            $table->id();
            // The owner is a USER, not a tutor_profile: a lecturer teaching a
            // class is not necessarily selling lessons on Find Tutor.
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->string('name');
            $table->string('subject')->nullable();
            $table->string('level')->nullable();
            $table->string('room')->nullable();
            $table->string('term')->nullable();
            $table->text('description')->nullable();

            /* How students get in. Unique because it is the credential — a
               collision would put someone in the wrong class. */
            $table->string('join_code', 12)->unique();
            // Lets a teacher stop new joins without deleting the class.
            $table->boolean('join_open')->default(true);

            $table->timestamp('archived_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'archived_at']);
        });

        Schema::create('classroom_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('classroom_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('joined_at');
            $table->timestamps();

            // One membership per person per class; joining twice is a no-op.
            $table->unique(['classroom_id', 'user_id']);
            $table->index('user_id');
        });

        /**
         * The curriculum log. An assignment and a material are the same row
         * with a different `type` — they share a title, body, attachments and
         * a position in the feed, and only assignments carry a due date and a
         * score. Two tables would duplicate all of that.
         */
        Schema::create('classroom_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('classroom_id')->constrained()->cascadeOnDelete();
            $table->string('type')->default('assignment');

            $table->string('title');
            $table->text('description')->nullable();

            // Assignment-only, hence nullable.
            $table->timestamp('due_at')->nullable();
            $table->boolean('allow_late')->default(true);
            $table->unsignedInteger('points')->nullable();

            $table->timestamps();

            $table->index(['classroom_id', 'created_at']);
        });

        // Files the teacher attaches to an item.
        Schema::create('classroom_item_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('classroom_item_id')->constrained()->cascadeOnDelete();
            $table->string('path');
            $table->string('name');
            $table->string('mime')->nullable();
            $table->unsignedBigInteger('size')->nullable();
            $table->timestamps();
        });

        Schema::create('submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('classroom_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->text('note')->nullable();
            $table->timestamp('submitted_at')->nullable();
            // Recorded at submit time by comparing against the item's due_at,
            // so it stays true even if the teacher moves the deadline later.
            $table->boolean('is_late')->default(false);

            $table->unsignedInteger('score')->nullable();
            $table->text('feedback')->nullable();
            $table->timestamp('graded_at')->nullable();
            $table->foreignId('graded_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            // One submission row per student per item — resubmitting replaces
            // its files rather than creating a second row to grade.
            $table->unique(['classroom_item_id', 'user_id']);
            $table->index('user_id');
        });

        Schema::create('submission_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('submission_id')->constrained()->cascadeOnDelete();
            $table->string('path');
            $table->string('name');
            $table->string('mime')->nullable();
            $table->unsignedBigInteger('size')->nullable();
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('submission_files');
        Schema::dropIfExists('submissions');
        Schema::dropIfExists('classroom_item_files');
        Schema::dropIfExists('classroom_items');
        Schema::dropIfExists('classroom_members');
        Schema::dropIfExists('classrooms');
    }
};
