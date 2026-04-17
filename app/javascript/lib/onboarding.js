// Keep this value in sync with app/jobs/chat_stream_job.rb ONBOARDING_SENTINEL.
// Sentinel is the user-message content that triggers AI's onboarding 4-turn flow.
// MessageBubble hides it so the UI doesn't show the gibberish string.
export const ONBOARDING_SENTINEL = '__onboarding_start__'
