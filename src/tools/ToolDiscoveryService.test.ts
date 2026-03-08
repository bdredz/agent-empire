import { describe, it, expect, beforeEach } from 'vitest'
import { ToolDiscoveryService, ToolDefinition } from './ToolDiscoveryService'

describe('ToolDiscoveryService', () => {
    let service: ToolDiscoveryService

    const scraperTool: ToolDefinition = {
        name: 'fetch_url',
        domain: 'web_scraping',
        description: 'Fetches content from a URL',
        schema: { type: 'object', properties: { url: { type: 'string' } } }
    }

    const parserTool: ToolDefinition = {
        name: 'parse_html',
        domain: 'data_transform',
        description: 'Parses DOM elements',
        schema: { type: 'object', properties: { html: { type: 'string' } } }
    }

    const writerTool: ToolDefinition = {
        name: 'write_file',
        domain: 'code_generation',
        description: 'Writes a file',
        schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } }
    }

    beforeEach(() => {
        service = new ToolDiscoveryService()
    })

    it('registers and discovers tools by domain', () => {
        service.register(scraperTool)
        const discovered = service.discover('web_scraping')

        expect(discovered).toHaveLength(1)
        expect(discovered[0]!.name).toBe('fetch_url')
    })

    it('filters by matching domain', () => {
        service.register(scraperTool)
        service.register(writerTool)

        const discovered = service.discover('code_generation')
        expect(discovered).toHaveLength(1)
        expect(discovered[0]!.name).toBe('write_file')
    })

    it('discovers tools for a specific task type', () => {
        service.register(scraperTool) // domain: web_scraping
        service.register(parserTool)  // domain: data_transform
        service.register(writerTool)  // domain: code_generation (not mapped to data_scraping)

        // taskToDomainMap maps 'data_scraping' -> ['web_scraping', 'data_transform']
        const discovered = service.discoverForTask('data_scraping')
        expect(discovered).toHaveLength(2)

        const names = discovered.map(t => t.name)
        expect(names).toContain('fetch_url')
        expect(names).toContain('parse_html')
        expect(names).not.toContain('write_file')
    })

    it('returns empty array when domain has no matches', () => {
        service.register(scraperTool)
        const discovered = service.discover('non_existent_domain')
        expect(discovered).toHaveLength(0)
    })

    it('returns empty array for unknown task type', () => {
        service.register(scraperTool)
        const discovered = service.discoverForTask('unknown_task_type')
        expect(discovered).toHaveLength(0)
    })

    it('handles duplicate registrations correctly (overwrites)', () => {
        service.register(scraperTool)

        const updatedScraperTool = { ...scraperTool, description: 'Updated description' }
        service.register(updatedScraperTool)

        const discovered = service.discover('web_scraping')
        expect(discovered).toHaveLength(1)
        expect(discovered[0]!.description).toBe('Updated description')
    })
})
