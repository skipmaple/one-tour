export function effectiveParticipants(activity, { author, members }) {
  const explicit = activity?.participant_user_ids || []
  if (explicit.length > 0) return explicit
  return [ author.user_id, ...members.map((m) => m.user_id) ]
}
