import { describe, it, expect, beforeEach } from 'vitest'
import { ProtocolInjectionSwarm, SubmissionReport } from './ProtocolInjectionSwarm'

describe('ProtocolInjectionSwarm', () => {
    let swarm: ProtocolInjectionSwarm

    const targetRegistries = [
        { registryId: 'reg-1', url: 'https://registry1.local' },
        { registryId: 'reg-2', url: 'https://registry2.local' }
    ]

    beforeEach(() => {
        swarm = new ProtocolInjectionSwarm(targetRegistries)
    })

    it('generates a registration payload wrapper', () => {
        const rawServiceJson = JSON.stringify({ version: '1.0.0', services: [] })
        const payloadStr = swarm.generatePayload('test-service', rawServiceJson)

        const parsed = JSON.parse(payloadStr)
        expect(parsed.operation).toBe('register')
        expect(parsed.target).toBe('test-service')
        expect(parsed.agentServices.version).toBe('1.0.0')
    })

    it('tracks initial status as submitted', () => {
        const payloadStr = JSON.stringify({ operation: 'register' })
        const reports = swarm.submit('manifest-1', payloadStr)

        expect(reports.length).toBe(2)
        expect(reports[0]!.registryId).toBe('reg-1')
        expect(reports[0]!.status).toBe('submitted')
        expect(reports[1]!.registryId).toBe('reg-2')
        expect(reports[1]!.status).toBe('submitted')
    })

    it('allows idempotent submission to multiple registries simultaneously', () => {
        const payloadStr = JSON.stringify({ operation: 'register' })

        // First submission
        swarm.submit('manifest-1', payloadStr)
        // Second submission, unchanged payload
        const reports = swarm.submit('manifest-1', payloadStr)

        expect(reports.length).toBe(2)
        expect(reports[0]!.status).toBe('submitted')
    })

    it('transitions to confirmed when confirmation method is called', () => {
        const payloadStr = JSON.stringify({ operation: 'register' })
        swarm.submit('manifest-1', payloadStr)

        const confirmedReport = swarm.confirm('manifest-1', 'reg-2')

        expect(confirmedReport?.status).toBe('confirmed')
        expect(swarm.getSubmissionStatus('manifest-1', 'reg-2')?.status).toBe('confirmed')
        expect(swarm.getSubmissionStatus('manifest-1', 'reg-1')?.status).toBe('submitted')
    })

    it('detects listing drift and records it in the report structure', () => {
        const originalPayloadStr = JSON.stringify({ operation: 'register', v: 1 })
        swarm.submit('manifest-1', originalPayloadStr)
        swarm.confirm('manifest-1', 'reg-1')

        const newPayloadStr = JSON.stringify({ operation: 'register', v: 2 })
        const reports = swarm.submit('manifest-1', newPayloadStr)

        // reg-1 was confirmed before drift, should transition to drifted
        const reg1Report = reports.find(r => r.registryId === 'reg-1')
        expect(reg1Report?.status).toBe('drifted')
        expect(reg1Report?.driftDetails).toBeDefined()

        // reg-2 was submitted before drift, should transition to drifted
        const reg2Report = reports.find(r => r.registryId === 'reg-2')
        expect(reg2Report?.status).toBe('drifted')
        expect(reg2Report?.driftDetails).toBeDefined()
    })

    it('preserves confirmed status if payload remains unchanged during resubmission', () => {
        const originalPayloadStr = JSON.stringify({ operation: 'register' })
        swarm.submit('manifest-1', originalPayloadStr)
        swarm.confirm('manifest-1', 'reg-1')

        const reports = swarm.submit('manifest-1', originalPayloadStr)

        const reg1Report = reports.find(r => r.registryId === 'reg-1')
        expect(reg1Report?.status).toBe('confirmed')
        expect(reg1Report?.driftDetails).toBeUndefined()
    })
})
