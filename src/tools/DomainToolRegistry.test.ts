import { describe, it, expect, beforeEach } from 'vitest'
import { DomainToolRegistry, DomainMapConfig } from './DomainToolRegistry'
import { ToolDefinition } from './ToolDiscoveryService'

describe('DomainToolRegistry', () => {
    let registry: DomainToolRegistry

    const scraperTool: ToolDefinition = {
        name: 'fetch_url',
        domain: 'web_scraping',
        description: 'Fetches content from a URL',
        schema: { type: 'object', properties: { url: { type: 'string' } } }
    }

    const parserTool: ToolDefinition = {
        name: 'parse_html',
        domain: 'web_scraping',
        description: 'Parses DOM elements',
        schema: { type: 'object', properties: { html: { type: 'string' } } }
    }

    const writerTool: ToolDefinition = {
        name: 'write_file',
        domain: 'code_generation',
        description: 'Writes a file',
        schema: { type: 'object', properties: { path: { type: 'string' } } }
    }

    beforeEach(() => {
        registry = new DomainToolRegistry()
    })

    it('performs domain lookup', () => {
        registry.registerDomainTools('web_scraping', [scraperTool])
        const tools = registry.getToolsForDomain('web_scraping')

        expect(tools).toHaveLength(1)
        expect(tools[0]!.name).toBe('fetch_url')
    })

    it('returns empty array for unknown domain', () => {
        registry.registerDomainTools('web_scraping', [scraperTool])
        const tools = registry.getToolsForDomain('unknown_domain')

        expect(tools).toHaveLength(0)
    })

    it('handles override config (constructor injection)', () => {
        const customConfig: DomainMapConfig = {
            'custom_domain': [writerTool]
        }
        const customRegistry = new DomainToolRegistry(customConfig)

        const tools = customRegistry.getToolsForDomain('custom_domain')
        expect(tools).toHaveLength(1)
        expect(tools[0]!.name).toBe('write_file')
    })

    it('handles multiple tools per domain', () => {
        registry.registerDomainTools('web_scraping', [scraperTool, parserTool])

        const tools = registry.getToolsForDomain('web_scraping')
        expect(tools).toHaveLength(2)

        const names = tools.map(t => t.name)
        expect(names).toContain('fetch_url')
        expect(names).toContain('parse_html')
    })

    it('deduplicates tools by name within a domain', () => {
        const updatedScraperTool = { ...scraperTool, description: 'Updated scraper' }

        // Pass same tool name twice (simulating overlap/override)
        registry.registerDomainTools('web_scraping', [scraperTool, updatedScraperTool])

        const tools = registry.getToolsForDomain('web_scraping')
        expect(tools).toHaveLength(1)
        expect(tools[0]!.name).toBe('fetch_url')
    })

    it('returns lean output format (name and schema only)', () => {
        registry.registerDomainTools('web_scraping', [scraperTool])
        const tools = registry.getToolsForDomain('web_scraping')

        expect(tools[0]!).toHaveProperty('name')
        expect(tools[0]!).toHaveProperty('schema')
        expect(tools[0]!).not.toHaveProperty('description')
        expect(tools[0]!).not.toHaveProperty('domain')
    })
})
