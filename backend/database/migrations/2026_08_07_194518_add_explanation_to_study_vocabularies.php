<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('study_vocabularies', function (Blueprint $table) {
            // Backs the "Explain" control on each vocabulary row. Authored by
            // the admin, but defaulted from the offline CEDICT entry on create
            // so rows are useful before anyone writes a note.
            $table->text('explanation')->nullable()->after('translation');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('study_vocabularies', function (Blueprint $table) {
            $table->dropColumn('explanation');
        });
    }
};
