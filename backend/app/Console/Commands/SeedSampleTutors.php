<?php

namespace App\Console\Commands;

use App\Models\TutorProfile;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Adds sample tutors that fill the gaps in the recommendation map: before
 * this, every approved tutor taught beginners or intermediates and nobody
 * covered business, exams, grammar, kids or advanced learners, so most
 * learning-preference answers had no tutor to match.
 *
 * Profiles only, no photos (the owner adds those). Each gets lessons with a
 * trial, weekly hours and a short resume so the profile page and booking both
 * work. Accounts use an @verbo.test address and a random password nobody
 * knows, like the other seeded tutors; the owner decides later who they are.
 *
 * Idempotent: keyed on the email, so running it again updates in place.
 */
class SeedSampleTutors extends Command
{
    protected $signature = 'tutors:seed-sample';

    protected $description = 'Add sample tutors covering every specialty and level (no photos).';

    private const TUTORS = [
        [
            'name' => 'Chen Hao', 'email' => 'chen.hao@verbo.test',
            'country' => 'China', 'timezone' => 'Asia/Shanghai', 'rate' => 28, 'years' => '8',
            'chinese_level' => 'Native speaker', 'levels' => ['Intermediate', 'Advanced'],
            'languages' => ['Mandarin', 'English'], 'specialties' => ['business', 'conversational'], 'main' => 'business',
            'short' => 'Business Chinese for meetings, email and negotiation.',
            'bio' => "Former account manager at a Shanghai trading firm. I teach the Chinese you need at work: introducing yourself in a meeting, writing a polite email, small talk over dinner with clients and negotiating a price without losing face.\n\nLessons are built around your real job. Bring an email you need to write or a meeting you are nervous about and we practise it together.",
            'style' => 'Role-play of real work situations, then a short review of the phrases you used.',
            'lessons' => [['Trial Lesson', 'Meet, set goals and try one work scenario.', 8, 30, true], ['Business Conversation', 'Meetings, calls and client small talk.', 28, 60, false], ['Email & Messages', 'Write and correct real work messages.', 22, 45, false]],
            'hours' => [[1, '18:00', '21:00'], [3, '18:00', '21:00'], [6, '09:00', '12:00']],
            'resume' => [['Education', '2008 — 2012', 'Fudan University', 'BA, International Business'], ['Certifications', '2016', 'CTCSOL', 'Certificate for Teachers of Chinese to Speakers of Other Languages']],
        ],
        [
            'name' => 'Wang Li', 'email' => 'wang.li@verbo.test',
            'country' => 'China', 'timezone' => 'Asia/Shanghai', 'rate' => 24, 'years' => '10',
            'chinese_level' => 'Native speaker', 'levels' => ['Intermediate', 'Advanced'],
            'languages' => ['Mandarin', 'English'], 'specialties' => ['exam', 'hsk', 'grammar'], 'main' => 'exam',
            'short' => 'HSK 4 to 6 exam coach with timed practice papers.',
            'bio' => "I have prepared more than 300 students for HSK 4, 5 and 6. We work through real past papers under time, then go back over every mistake so you know exactly why the answer was right.\n\nI also teach the writing section step by step, which is where most students lose points.",
            'style' => 'Timed papers, error review and a weekly study plan.',
            'lessons' => [['Trial Lesson', 'A short placement test and a study plan.', 6, 30, true], ['HSK Exam Practice', 'Timed sections with full review.', 24, 60, false], ['HSK Writing Clinic', 'Essay structure and correction.', 20, 45, false]],
            'hours' => [[0, '09:00', '12:00'], [2, '19:00', '22:00'], [4, '19:00', '22:00']],
            'resume' => [['Education', '2006 — 2010', 'Beijing Language and Culture University', 'BA, Teaching Chinese as a Foreign Language'], ['Certifications', '2014', 'HSK Examiner Training', 'Hanban / CTI']],
        ],
        [
            'name' => 'Zhao Mei', 'email' => 'zhao.mei@verbo.test',
            'country' => 'China', 'timezone' => 'Asia/Shanghai', 'rate' => 15, 'years' => '5',
            'chinese_level' => 'Native speaker', 'levels' => ['Beginner'],
            'languages' => ['Mandarin', 'English'], 'specialties' => ['kids', 'pronunciation'], 'main' => 'kids',
            'short' => 'Playful Chinese for children aged 5 to 12.',
            'bio' => "I teach young learners through songs, games and picture cards. Lessons are short and active so children stay focused, and parents get a two-line note after each lesson with what we covered.\n\nI pay special attention to tones from the very first lesson, while children still hear them easily.",
            'style' => 'Games, songs and picture cards in 30-minute lessons.',
            'lessons' => [['Trial Lesson', 'Meet your child and try a game-based lesson.', 5, 25, true], ['Kids Chinese', 'Songs, games and first characters.', 15, 30, false]],
            'hours' => [[2, '16:00', '19:00'], [4, '16:00', '19:00'], [6, '09:00', '13:00']],
            'resume' => [['Education', '2013 — 2017', 'East China Normal University', 'BA, Early Childhood Education']],
        ],
        [
            'name' => 'Liu Yang', 'email' => 'liu.yang@verbo.test',
            'country' => 'Taiwan', 'timezone' => 'Asia/Taipei', 'rate' => 20, 'years' => '6',
            'chinese_level' => 'Native speaker', 'levels' => ['Intermediate', 'Advanced'],
            'languages' => ['Mandarin', 'English', 'Japanese'], 'specialties' => ['grammar', 'speaking'], 'main' => 'grammar',
            'short' => 'Clear grammar explanations, then lots of speaking practice.',
            'bio' => "Grammar does not have to be a list of rules. I explain one pattern at a time with examples from real conversation, then we use it straight away until it feels natural.\n\nGood for learners who can get by but keep making the same mistakes with 了, 过, 把 and 被.",
            'style' => 'One grammar point per lesson, explained then practised out loud.',
            'lessons' => [['Trial Lesson', 'Find the patterns that trip you up.', 6, 30, true], ['Grammar in Use', 'One pattern, many examples, lots of speaking.', 20, 60, false]],
            'hours' => [[1, '10:00', '14:00'], [3, '10:00', '14:00'], [5, '19:00', '22:00']],
            'resume' => [['Education', '2010 — 2014', 'National Taiwan Normal University', 'BA, Chinese as a Second Language']],
        ],
        [
            'name' => 'Sophea Lim', 'email' => 'sophea.lim@verbo.test',
            'country' => 'Cambodia', 'timezone' => 'Asia/Phnom_Penh', 'rate' => 10, 'years' => '4',
            'chinese_level' => 'Advanced (HSK 6)', 'levels' => ['Beginner'],
            'languages' => ['Mandarin', 'Khmer', 'English'], 'specialties' => ['everyday', 'conversational', 'pronunciation'], 'main' => 'everyday',
            'short' => 'Beginner Chinese explained in Khmer.',
            'bio' => "I learned Chinese as a Cambodian student, so I know which sounds and tones are hardest for Khmer speakers. I explain in Khmer when you need it and move to Chinese as you grow.\n\nWe start with the phrases you will use every day: greetings, numbers, shopping and asking for directions.",
            'style' => 'Explanations in Khmer, practice in Chinese, homework on WhatsApp.',
            'lessons' => [['Trial Lesson', 'Meet, test your level and set goals.', 3, 30, true], ['Everyday Chinese', 'Phrases for daily life, in Khmer and Chinese.', 10, 60, false], ['Pinyin & Tones', 'Fix the sounds that are hard for Khmer speakers.', 8, 45, false]],
            'hours' => [[1, '17:00', '20:00'], [2, '17:00', '20:00'], [4, '17:00', '20:00'], [6, '08:00', '11:00']],
            'resume' => [['Education', '2014 — 2018', 'Royal University of Phnom Penh', 'BA, Chinese Language'], ['Certifications', '2019', 'HSK 6', 'Score 241']],
        ],
        [
            'name' => 'Huang Jun', 'email' => 'huang.jun@verbo.test',
            'country' => 'China', 'timezone' => 'Asia/Shanghai', 'rate' => 18, 'years' => '7',
            'chinese_level' => 'Native speaker', 'levels' => ['Beginner', 'Intermediate'],
            'languages' => ['Mandarin', 'English', 'Spanish'], 'specialties' => ['travel', 'everyday'], 'main' => 'travel',
            'short' => 'Survival Chinese for trips to China.',
            'bio' => "Going to China soon? I teach exactly what you need on the road: taxis and high-speed trains, ordering food, hotel check-in, paying with your phone and asking for help.\n\nEach lesson is one travel situation, practised until you can handle it without notes.",
            'style' => 'One travel situation per lesson, role-played until it is easy.',
            'lessons' => [['Trial Lesson', 'Plan the phrases for your trip.', 5, 30, true], ['Travel Chinese', 'Taxis, trains, food and hotels.', 18, 60, false]],
            'hours' => [[0, '14:00', '18:00'], [3, '09:00', '12:00'], [5, '09:00', '12:00']],
            'resume' => [['Education', '2009 — 2013', 'Sichuan University', 'BA, Tourism Management']],
        ],
        [
            'name' => 'Sun Qing', 'email' => 'sun.qing@verbo.test',
            'country' => 'China', 'timezone' => 'Asia/Shanghai', 'rate' => 26, 'years' => '12',
            'chinese_level' => 'Native speaker', 'levels' => ['Advanced'],
            'languages' => ['Mandarin', 'English', 'French'], 'specialties' => ['conversational', 'speaking'], 'main' => 'conversational',
            'short' => 'Advanced discussion: news, culture and debate.',
            'bio' => "For learners who already speak well and want to sound natural. We read a short news piece or watch a clip, then discuss it in depth, and I note the words and idioms a native speaker would use instead.\n\nExpect real opinions and real disagreement; that is where fluency comes from.",
            'style' => 'Discussion of news and culture, with idioms and corrections at the end.',
            'lessons' => [['Trial Lesson', 'A short discussion to hear your level.', 8, 30, true], ['Advanced Discussion', 'News, culture and debate topics.', 26, 60, false]],
            'hours' => [[2, '20:00', '23:00'], [4, '20:00', '23:00'], [0, '15:00', '18:00']],
            'resume' => [['Education', '2004 — 2008', 'Peking University', 'BA, Chinese Language and Literature'], ['Education', '2008 — 2011', 'Peking University', 'MA, Linguistics']],
        ],
        [
            'name' => 'Ma Xiaoyu', 'email' => 'ma.xiaoyu@verbo.test',
            'country' => 'China', 'timezone' => 'Asia/Shanghai', 'rate' => 14, 'years' => '3',
            'chinese_level' => 'Native speaker', 'levels' => ['All levels'],
            'languages' => ['Mandarin', 'English', 'Korean'], 'specialties' => ['pronunciation', 'hsk'], 'main' => 'pronunciation',
            'short' => 'Tones and pronunciation, fixed one sound at a time.',
            'bio' => "Trained in phonetics, I find the exact sounds you get wrong and fix them with simple mouth and tone exercises. Record yourself before and after; the difference is easy to hear.\n\nAlso helps with the listening and speaking parts of HSK.",
            'style' => 'Short drills, recordings and tone pair practice.',
            'lessons' => [['Trial Lesson', 'A pronunciation check and a plan.', 4, 25, true], ['Pronunciation Coaching', 'Tones, initials and finals.', 14, 45, false]],
            'hours' => [[1, '08:00', '11:00'], [3, '19:00', '22:00'], [5, '19:00', '22:00'], [6, '14:00', '17:00']],
            'resume' => [['Education', '2016 — 2020', 'Nanjing University', 'BA, Chinese Phonetics']],
        ],
    ];

    public function handle(): int
    {
        foreach (self::TUTORS as $t) {
            DB::transaction(function () use ($t) {
                $user = User::firstOrNew(['email' => $t['email']]);
                $user->name = $t['name'];
                if (! $user->exists) {
                    // Nobody knows this password; the account is a placeholder
                    // until the owner decides who it belongs to.
                    $user->password = Hash::make(Str::random(64));
                }
                $user->forceFill(['email_verified_at' => $user->email_verified_at ?? now(), 'onboarded_at' => $user->onboarded_at ?? now()])->save();

                $profile = $user->tutorProfile()->updateOrCreate([], [
                    'bio' => $t['bio'],
                    'short_bio' => $t['short'],
                    'subjects' => 'Chinese',
                    'hourly_rate' => $t['rate'],
                    'languages_spoken' => implode(', ', $t['languages']),
                    'availability' => 'See weekly hours',
                    'timezone' => $t['timezone'],
                    'allows_pre_booking_questions' => true,
                    'country' => $t['country'],
                    'chinese_level' => $t['chinese_level'],
                    'teaches_levels' => $t['levels'],
                    'years_experience' => $t['years'],
                    'teaching_style' => $t['style'],
                    'teaching_languages' => $t['languages'],
                    'specialties' => $t['specialties'],
                    'main_specialty' => $t['main'],
                ]);
                $profile->forceFill(['status' => TutorProfile::APPROVED])->save();

                $profile->lessons()->delete();
                foreach ($t['lessons'] as [$name, $desc, $price, $mins, $trial]) {
                    $profile->lessons()->create(['name' => $name, 'description' => $desc, 'price' => $price, 'duration_minutes' => $mins, 'is_trial' => $trial]);
                }

                $profile->availabilitySlots()->delete();
                foreach ($t['hours'] as [$day, $start, $end]) {
                    $profile->availabilitySlots()->create(['day_of_week' => $day, 'start_time' => $start, 'end_time' => $end]);
                }

                $profile->resumeEntries()->delete();
                foreach ($t['resume'] as $i => [$section, $years, $title, $detail]) {
                    $profile->resumeEntries()->create(['section' => $section, 'years' => $years, 'title' => $title, 'detail' => $detail, 'position' => $i]);
                }
            });
            $this->line("  {$t['name']}  ({$t['main']}; ".implode(', ', $t['levels']).')');
        }
        $this->info(count(self::TUTORS).' sample tutors ready.');

        return self::SUCCESS;
    }
}
