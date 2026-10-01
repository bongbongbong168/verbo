<?php

namespace Database\Seeders;

use App\Models\StudyLevel;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Four small, practical Mandarin situations. Safe to run again: existing
 * authored rows are never replaced, and the lesson content is not duplicated.
 */
class DailyUseSituationsSeeder extends Seeder
{
    public function run(): void
    {
        $authorId = StudyLevel::where('category', 'daily')->value('user_id')
            ?? User::where('is_admin', true)->value('id');

        if (! $authorId) {
            throw new RuntimeException('Create an admin account before seeding Daily Use situations.');
        }

        foreach ($this->situations() as $topic) {
            DB::transaction(function () use ($authorId, $topic) {
                $level = StudyLevel::firstOrCreate(
                    ['category' => 'daily', 'title' => $topic['title']],
                    [
                        'user_id' => $authorId,
                        'description' => $topic['description'],
                        'level_label' => $topic['level'],
                        'topic_group' => $topic['group'],
                        'emoji' => $topic['emoji'],
                        'accent_color' => '#a89ce3',
                    ]
                );
                if (! $level->topic_group) {
                    $level->update(['topic_group' => $topic['group']]);
                }

                $unit = $level->units()->firstOrCreate(
                    ['title' => $topic['lesson']],
                    [
                        'description' => $topic['goal'],
                        'culture_title' => $topic['note_title'],
                        'culture_body' => $topic['note'],
                    ]
                );

                $text = $unit->texts()->firstOrCreate(
                    ['title' => 'A real-life conversation'],
                    ['position' => 0]
                );
                foreach ($topic['lines'] as $position => [$speaker, $chinese, $pinyin, $english]) {
                    $text->lines()->firstOrCreate(
                        ['position' => $position, 'chinese' => $chinese],
                        ['speaker' => $speaker, 'pinyin' => $pinyin, 'english' => $english]
                    );
                }

                foreach ($topic['words'] as [$hanzi, $pinyin, $english, $note]) {
                    $unit->vocabulary()->firstOrCreate(
                        ['hanzi' => $hanzi],
                        ['pinyin' => $pinyin, 'translation' => $english, 'explanation' => $note]
                    );
                }

                $grammar = $unit->grammarPoints()->firstOrCreate(
                    ['title' => $topic['pattern']],
                    ['description' => $topic['pattern_note'], 'structure' => $topic['structure']]
                );
                $grammar->examples()->firstOrCreate(
                    ['chinese' => $topic['example'][0]],
                    ['pinyin' => $topic['example'][1], 'english' => $topic['example'][2], 'position' => 0]
                );
            });
        }
    }

    private function situations(): array
    {
        return [
            [
                'title' => 'Ordering Food', 'group' => 'Food & Restaurants', 'level' => 'Beginner', 'emoji' => '🍜',
                'description' => 'Order at a small restaurant, change a dish, and ask for takeaway.',
                'lesson' => '来一份牛肉面 - Ordering at a noodle shop',
                'goal' => 'Order a dish, ask for less chili, and pay for takeaway.',
                'note_title' => 'At a casual noodle shop',
                'note' => 'At a small casual eatery in mainland China, calling the proprietor 老板 can sound friendly; 服务员 is a safer choice for a server you do not know. 来一份 is an everyday way to order one portion. 打包 means packing food to take away; payment methods vary by shop.',
                'lines' => [
                    ['Customer', '老板，来一份牛肉面，少放点辣椒。', 'Lǎobǎn, lái yí fèn niúròu miàn, shǎo fàng diǎn làjiāo.', 'One order of beef noodles, please, with less chili.'],
                    ['Staff', '好，要不要加个蛋？', 'Hǎo, yào bu yào jiā ge dàn?', 'Sure. Would you like to add an egg?'],
                    ['Customer', '要，再来一瓶水。可以打包吗？', 'Yào, zài lái yì píng shuǐ. Kěyǐ dǎbāo ma?', 'Yes, and a bottle of water. Can I get it to go?'],
                    ['Staff', '可以。还要别的吗？', 'Kěyǐ. Hái yào bié de ma?', 'Sure. Anything else?'],
                    ['Customer', '不要了，一共多少钱？', 'Bú yào le, yígòng duōshao qián?', 'That’s all. How much is it in total?'],
                    ['Staff', '三十五块，扫码就行。', 'Sānshíwǔ kuài, sǎomǎ jiù xíng.', 'Thirty-five yuan. You can scan to pay.'],
                ],
                'words' => [
                    ['来一份', 'lái yí fèn', 'one portion, please', 'A natural way to order one serving.'],
                    ['牛肉面', 'niúròu miàn', 'beef noodles', 'A common noodle-shop dish.'],
                    ['少放', 'shǎo fàng', 'put in less', 'Useful for customizing food.'],
                    ['辣椒', 'làjiāo', 'chili pepper', 'Say 少放点辣椒 to ask for less chili.'],
                    ['加个蛋', 'jiā ge dàn', 'add an egg', '个 is a casual measure word here.'],
                    ['打包', 'dǎbāo', 'pack to take away', 'Used for takeaway food or leftovers.'],
                    ['一共', 'yígòng', 'in total', 'Use when asking for the final price.'],
                    ['扫码', 'sǎomǎ', 'scan a code', 'Often used for QR-code payment.'],
                    ['块', 'kuài', 'yuan (colloquial)', 'Everyday spoken way to name a price in yuan.'],
                ],
                'pattern' => '少/多 + 放 + ingredient',
                'pattern_note' => 'Use 少放点 or 多放点 before an ingredient to adjust how much goes into a dish.',
                'structure' => '少/多 + 放 + 点 + ingredient',
                'example' => ['少放点辣椒。', 'Shǎo fàng diǎn làjiāo.', 'Please use less chili.'],
            ],
            [
                'title' => 'Taking a Ride', 'group' => 'Travel', 'level' => 'Beginner', 'emoji' => '🚕',
                'description' => 'Tell a driver where you are going and where to stop.',
                'lesson' => '在前面停 - Stop up ahead',
                'goal' => 'Give a destination, check the route, and ask to stop naturally.',
                'note_title' => 'Speaking to a driver',
                'note' => 'In mainland China, 师傅 is a common polite way to address a driver. “前面路口停就行” sounds more natural than a word-for-word “stop the car at the intersection.” Use 您 if you want a more formal tone.',
                'lines' => [
                    ['Passenger', '师傅，去人民路，麻烦您了。', 'Shīfu, qù Rénmín Lù, máfan nín le.', 'To Renmin Road, please.'],
                    ['Driver', '好，您赶时间吗？', 'Hǎo, nín gǎn shíjiān ma?', 'Sure. Are you in a hurry?'],
                    ['Passenger', '不赶，正常开就行。', 'Bù gǎn, zhèngcháng kāi jiù xíng.', 'No rush. The normal route is fine.'],
                    ['Driver', '前面那个路口可以吗？', 'Qiánmiàn nà ge lùkǒu kěyǐ ma?', 'Is the intersection ahead okay?'],
                    ['Passenger', '可以，靠边停就行，谢谢。', 'Kěyǐ, kàobiān tíng jiù xíng, xièxie.', 'Yes, stopping by the curb is fine. Thanks.'],
                    ['Driver', '好的，到了。', 'Hǎo de, dào le.', 'Okay, we’re here.'],
                ],
                'words' => [
                    ['师傅', 'shīfu', 'driver; a polite form of address', 'Common when speaking to a driver or skilled worker.'],
                    ['麻烦', 'máfan', 'to trouble; please', 'Softens a request without a long formal sentence.'],
                    ['赶时间', 'gǎn shíjiān', 'to be in a hurry', 'Literally “rush for time.”'],
                    ['正常', 'zhèngcháng', 'normal; usual', 'Here it means the usual way of driving.'],
                    ['路口', 'lùkǒu', 'intersection', 'A useful landmark for giving directions.'],
                    ['靠边', 'kàobiān', 'pull over; move to the side', 'Often said with 停 when asking a driver to stop.'],
                    ['就行', 'jiù xíng', 'that is fine; that will do', 'Makes an instruction sound flexible.'],
                ],
                'pattern' => '…就行', 'pattern_note' => 'Use 就行 after an action or option to say it is enough or acceptable.',
                'structure' => 'Action or option + 就行',
                'example' => ['在前面停就行。', 'Zài qiánmiàn tíng jiù xíng.', 'Stopping up ahead is fine.'],
            ],
            [
                'title' => 'Meeting a Friend', 'group' => 'Social', 'level' => 'Beginner', 'emoji' => '📍',
                'description' => 'Text someone when you are running late or trying to find them.',
                'lesson' => '你到哪儿了 - Where are you now?',
                'goal' => 'Say where you are, how soon you will arrive, and where to meet.',
                'note_title' => 'Short messages sound natural',
                'note' => 'Friends often use short messages such as “我快到了” instead of a full formal sentence. “你到哪儿了？” asks about someone’s progress toward the meeting place, not just their permanent location. 哪儿 is common in the north; 哪里 works too.',
                'lines' => [
                    ['Friend', '你到哪儿了？', 'Nǐ dào nǎr le?', 'Where are you now?'],
                    ['You', '我刚下地铁，快到了。', 'Wǒ gāng xià dìtiě, kuài dào le.', 'I just got off the metro. I’m almost there.'],
                    ['Friend', '好，我在商场门口等你。', 'Hǎo, wǒ zài shāngchǎng ménkǒu děng nǐ.', 'Okay, I’ll wait at the mall entrance.'],
                    ['You', '不好意思，让你久等了。', 'Bù hǎoyìsi, ràng nǐ jiǔ děng le.', 'Sorry to keep you waiting.'],
                    ['Friend', '没事，我也刚到。', 'Méi shì, wǒ yě gāng dào.', 'No problem. I just got here too.'],
                    ['You', '我看到你了，马上过来。', 'Wǒ kàndào nǐ le, mǎshàng guòlái.', 'I see you. I’ll come right over.'],
                ],
                'words' => [
                    ['到哪儿了', 'dào nǎr le', 'where have you got to?', 'Asks how far along someone is on their way.'],
                    ['刚', 'gāng', 'just now', 'Often placed before a verb for a very recent action.'],
                    ['地铁', 'dìtiě', 'metro; subway', 'Common urban transport.'],
                    ['快到了', 'kuài dào le', 'almost there', 'A short, everyday status update.'],
                    ['门口', 'ménkǒu', 'entrance; doorway', 'Useful for choosing an exact meeting point.'],
                    ['不好意思', 'bù hǎoyìsi', 'sorry; excuse me', 'Natural for a small inconvenience.'],
                    ['久等', 'jiǔ děng', 'wait a long time', 'Used in the apology 让你久等了.'],
                    ['马上', 'mǎshàng', 'right away', 'Signals that the action will happen soon.'],
                ],
                'pattern' => '刚 + verb', 'pattern_note' => 'Use 刚 before a verb to say something happened just now.',
                'structure' => 'Person + 刚 + verb + (object)',
                'example' => ['我刚下地铁。', 'Wǒ gāng xià dìtiě.', 'I just got off the metro.'],
            ],
            [
                'title' => 'Picking Up a Parcel', 'group' => 'Daily Life', 'level' => 'Intermediate', 'emoji' => '📦',
                'description' => 'Find a parcel and ask for help when the pickup code fails.',
                'lesson' => '取件码打不开 - The pickup code is not working',
                'goal' => 'Ask where to collect a parcel and explain a code problem.',
                'note_title' => 'A mainland China situation',
                'note' => 'This dialogue describes a mainland Chinese parcel pickup point. Some deliveries use a counter, others a locker; the process varies by location. 取件码 is the code used to collect a parcel. For a person at a counter, “麻烦帮我看一下” is a natural, polite request.',
                'lines' => [
                    ['You', '你好，我来取快递。', 'Nǐ hǎo, wǒ lái qǔ kuàidì.', 'Hi, I’m here to pick up a parcel.'],
                    ['Staff', '有取件码吗？', 'Yǒu qǔjiànmǎ ma?', 'Do you have a pickup code?'],
                    ['You', '有，但是输入以后打不开。', 'Yǒu, dànshì shūrù yǐhòu dǎ bù kāi.', 'Yes, but it won’t open after I enter it.'],
                    ['Staff', '我帮你看一下。手机号后四位是多少？', 'Wǒ bāng nǐ kàn yíxià. Shǒujī hào hòu sì wèi shì duōshao?', 'Let me check. What are the last four digits of your phone number?'],
                    ['You', '是六二八九。', 'Shì liù èr bā jiǔ.', 'Six, two, eight, nine.'],
                    ['Staff', '找到了，在这儿。', 'Zhǎodào le, zài zhèr.', 'Found it. Here it is.'],
                ],
                'words' => [
                    ['取快递', 'qǔ kuàidì', 'pick up a parcel', 'A common phrase for collecting a delivery.'],
                    ['取件码', 'qǔjiànmǎ', 'pickup code', 'The code for collecting a parcel.'],
                    ['输入', 'shūrù', 'enter; input', 'Used for entering a code or number.'],
                    ['打不开', 'dǎ bù kāi', 'cannot open', 'A result-complement pattern for something that will not open.'],
                    ['帮', 'bāng', 'help', '帮你看一下 means “let me check for you.”'],
                    ['手机号', 'shǒujī hào', 'mobile phone number', 'Often used to look up a delivery.'],
                    ['后四位', 'hòu sì wèi', 'last four digits', '位 counts positions in a number.'],
                    ['找到了', 'zhǎodào le', 'found it', '到 marks successfully finding something.'],
                ],
                'pattern' => 'Verb + 不 + result', 'pattern_note' => 'Put 不 between a verb and its result to say you cannot achieve that result.',
                'structure' => 'Verb + 不 + result',
                'example' => ['这个柜子打不开。', 'Zhè ge guìzi dǎ bù kāi.', 'This locker will not open.'],
            ],
        ];
    }
}
