<?php

namespace Tests\Feature;

use App\Services\DictionaryService;
use Tests\TestCase;

/** CEDICT markup never reaches a learner as a "meaning". */
class DictionaryTidyTest extends TestCase
{
    public function test_it_strips_cedict_markup(): void
    {
        $this->assertSame('used in 上声', DictionaryService::tidy('used in 上聲|上声[shang3 sheng1]'));
        $this->assertSame('CL:个,只', DictionaryService::tidy('CL:個|个[ge4],隻|只[zhi1]'));
        $this->assertSame('a move in chess', DictionaryService::tidy('a move in chess (Taiwan pr. [zhao2])'));
        $this->assertSame('you (informal, as opposed to courteous 您)', DictionaryService::tidy('you (informal, as opposed to courteous 您[nin2])'));
        // Ordinary meanings are untouched.
        $this->assertSame('(cooked) rice; meal', DictionaryService::tidy('(cooked) rice; meal'));
    }
}
