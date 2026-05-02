import { describe, it, expect } from 'vitest'
import { friendlyError } from '../errors'

describe('friendlyError', () => {
  it('404 → 同伴删除', () => {
    expect(friendlyError(404, '<!DOCTYPE html><title>Not Found</title>')).toBe('这条已被同伴删除,无法同步')
  })

  it('403 → 不是成员', () => {
    expect(friendlyError(403, '')).toBe('你已不是这次旅程的成员,无法保存')
  })

  it('401 → 登录过期', () => {
    expect(friendlyError(401, '')).toBe('登录已过期,请重新登录')
  })

  it('413 → 照片太大', () => {
    expect(friendlyError(413, '')).toBe('照片太大,请重选')
  })

  it('429 → 请求频繁', () => {
    expect(friendlyError(429, '')).toBe('请求太频繁,稍后会自动重试')
  })

  it('408 → 同 429 治', () => {
    expect(friendlyError(408, '')).toBe('请求太频繁,稍后会自动重试')
  })

  it('500 / 502 / 503 → 服务器错', () => {
    expect(friendlyError(500, '')).toBe('服务器暂时无法处理,稍后再试')
    expect(friendlyError(502, '')).toBe('服务器暂时无法处理,稍后再试')
    expect(friendlyError(503, '')).toBe('服务器暂时无法处理,稍后再试')
  })

  it('422 with Rails JSON errors array → 抽出来拼接', () => {
    const body = JSON.stringify({ errors: ['金额不能为空', '类别必须是有效值', '小票超过 10MB', '第 4 条不显示'] })
    const msg = friendlyError(422, body)
    expect(msg).toContain('金额不能为空')
    expect(msg).toContain('类别必须是有效值')
    expect(msg).toContain('小票超过 10MB')
    expect(msg).not.toContain('第 4 条不显示') // 截断到 3 条
  })

  it('422 with Rails per-field errors hash → 抽 field: msg', () => {
    const body = JSON.stringify({ errors: { amount_cents: ['不能为空'], note: ['过长'] } })
    const msg = friendlyError(422, body)
    expect(msg).toContain('amount_cents: 不能为空')
    expect(msg).toContain('note: 过长')
  })

  it('422 with single error string', () => {
    expect(friendlyError(422, JSON.stringify({ error: 'CSRF token mismatch' }))).toBe('CSRF token mismatch')
  })

  it('422 with HTML body(Rails dev 错误页)→ fallback 文案', () => {
    const html = '<!DOCTYPE html><title>The change you wanted was rejected</title>'
    expect(friendlyError(422, html)).toBe('服务器拒绝了这条改动,请编辑后重试')
  })

  it('400 同 422 一样处理', () => {
    expect(friendlyError(400, '')).toBe('服务器拒绝了这条改动,请编辑后重试')
  })

  it('status=null(network throw)→ 网络丢了文案', () => {
    expect(friendlyError(null, '')).toBe('网络一直没好,改动还在排队')
  })

  it('status=0 同 null', () => {
    expect(friendlyError(0, '')).toBe('网络一直没好,改动还在排队')
  })

  it('其他 4xx 默认拒绝', () => {
    expect(friendlyError(418, '')).toBe('服务器拒绝了这条改动,请编辑后重试')
  })
})
