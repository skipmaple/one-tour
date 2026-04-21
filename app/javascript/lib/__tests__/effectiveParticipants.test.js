import { describe, it, expect } from 'vitest'
import { effectiveParticipants } from '../effectiveParticipants'

describe('effectiveParticipants', () => {
  const author  = { user_id: 1, name: '作者' }
  const members = [
    { user_id: 2, name: '乙', role: 'editor' },
    { user_id: 3, name: '丙', role: 'reader' },
  ]

  it('returns [author, ...members] when participant_user_ids is empty', () => {
    const activity = { id: 10, participant_user_ids: [] }
    expect(effectiveParticipants(activity, { author, members })).toEqual([ 1, 2, 3 ])
  })

  it('returns [author, ...members] when participant_user_ids is undefined', () => {
    const activity = { id: 10 }
    expect(effectiveParticipants(activity, { author, members })).toEqual([ 1, 2, 3 ])
  })

  it('returns explicit participant_user_ids when non-empty', () => {
    const activity = { id: 10, participant_user_ids: [ 2 ] }
    expect(effectiveParticipants(activity, { author, members })).toEqual([ 2 ])
  })

  it('preserves order of explicit ids', () => {
    const activity = { id: 10, participant_user_ids: [ 3, 1 ] }
    expect(effectiveParticipants(activity, { author, members })).toEqual([ 3, 1 ])
  })
})
