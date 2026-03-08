import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import { applyMiddleware } from './middleware'

describe('Middleware - Rate Limiter', () => {
    let app: Hono

    beforeEach(() => {
        // Reset env vars before each test
        process.env.RATE_LIMIT_MAX = '5'
        process.env.RATE_LIMIT_WINDOW_MS = '60000'

        app = new Hono()
        applyMiddleware(app)
        app.get('/test', (c) => c.text('ok'))

        // Fast-forward timers might be needed for the reset logic, but for simple counts, we can just hit it.
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('allows requests within limit and sets headers', async () => {
        const res = await app.request('/test', {
            headers: { 'x-forwarded-for': '1.2.3.4' }
        })

        expect(res.status).toBe(200)
        expect(res.headers.get('x-ratelimit-limit')).toBe('5')
        expect(res.headers.get('x-ratelimit-remaining')).toBe('4')
        expect(res.headers.get('x-ratelimit-reset')).toBeTruthy()
    })

    it('blocks requests over the limit returning 429', async () => {
        // Make 5 requests (the limit)
        for (let i = 0; i < 5; i++) {
            await app.request('/test', { headers: { 'x-forwarded-for': '4.3.2.1' } })
        }

        // 6th request should fail
        const res = await app.request('/test', { headers: { 'x-forwarded-for': '4.3.2.1' } })

        expect(res.status).toBe(429)
        expect(res.headers.get('retry-after')).toBeTruthy()
        const body = await res.json()
        expect(body).toEqual({ error: 'Too many requests' })
    })

    it('maintains separate limits for different IPs', async () => {
        // Exhaust IP1
        for (let i = 0; i < 5; i++) {
            await app.request('/test', { headers: { 'x-forwarded-for': '192.168.1.1' } })
        }

        // Check IP1 is blocked
        const resIp1 = await app.request('/test', { headers: { 'x-forwarded-for': '192.168.1.1' } })
        expect(resIp1.status).toBe(429)

        // Check IP2 works
        const resIp2 = await app.request('/test', { headers: { 'x-forwarded-for': '192.168.1.2' } })
        expect(resIp2.status).toBe(200)
        expect(resIp2.headers.get('x-ratelimit-remaining')).toBe('4')
    })

    it('resets the limit after the window expires', async () => {
        // Make 5 requests (the limit)
        for (let i = 0; i < 5; i++) {
            await app.request('/test', { headers: { 'x-forwarded-for': '10.0.0.1' } })
        }

        // Should be blocked
        let res = await app.request('/test', { headers: { 'x-forwarded-for': '10.0.0.1' } })
        expect(res.status).toBe(429)

        // Fast-forward time past 60s
        vi.advanceTimersByTime(61000)

        // Should work again
        res = await app.request('/test', { headers: { 'x-forwarded-for': '10.0.0.1' } })
        expect(res.status).toBe(200)
        expect(res.headers.get('x-ratelimit-remaining')).toBe('4')
    })
})
