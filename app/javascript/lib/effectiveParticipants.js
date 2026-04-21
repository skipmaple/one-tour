// Single source for the "empty participant_user_ids = 默认全员" convention.
// Three call sites should read these helpers rather than re-inventing the
// check: ActivityDrawer 参与人 tab (drives Alert + toggle mode),
// ActivityCard Avatar group (render-or-skip), AddExpenseDialog prefill.
export function isFullRoster(activity) {
  const ids = activity?.participant_user_ids
  return !Array.isArray(ids) || ids.length === 0
}

export function effectiveParticipants(activity, { author, members }) {
  if (!isFullRoster(activity)) return activity.participant_user_ids
  return [ author.user_id, ...members.map((m) => m.user_id) ]
}
