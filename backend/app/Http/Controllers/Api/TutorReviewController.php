<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TutorProfile;
use App\Models\TutorReview;
use Illuminate\Http\Request;
use App\Rules\NoUnsafeLinks;

class TutorReviewController extends Controller
{
    /**
     * Leave a review, or edit the one you already left.
     *
     * Any signed-in user may review — there is no "completed a lesson" state to
     * gate on, since a booking here is only a contact request. What is enforced
     * is one review per person per tutor: posting again updates yours rather
     * than stacking duplicates, which is also what makes the average meaningful.
     */
    public function store(Request $request, TutorProfile $tutorProfile)
    {
        // A tutor rating themselves would let anyone manufacture their own
        // average. Same rule BookingController uses to stop self-booking.
        if ((int) $tutorProfile->user_id === $request->user()->id) {
            return response()->json(['message' => 'You cannot review your own profile.'], 422);
        }

        $data = $request->validate([
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'body' => ['required', 'string', 'max:2000', new NoUnsafeLinks],
        ]);

        $review = $tutorProfile->reviews()->updateOrCreate(
            ['user_id' => $request->user()->id],
            $data
        );

        return response()->json($review->load('user:id,name'), 201);
    }

    /**
     * Remove a review. The author can delete their own; an admin can remove
     * any, which is the only moderation path this app has.
     */
    public function destroy(Request $request, TutorReview $tutorReview)
    {
        $user = $request->user();

        abort_unless((int) $tutorReview->user_id === $user->id || $user->is_admin, 403);

        $tutorReview->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
