import { ToolDefinition } from './ToolDiscoveryService'

export interface LeanToolDescription {
    readonly name: string
    readonly schema: Record<string, unknown>
}

export type DomainMapConfig = Record<string, ToolDefinition[]>

export interface IDomainToolRegistry {
    getToolsForDomain(domain: string): LeanToolDescription[]
    registerDomainTools(domain: string, tools: ToolDefinition[]): void
}

export class DomainToolRegistry implements IDomainToolRegistry {
    private readonly domainMap = new Map<string, Map<string, ToolDefinition>>()

    constructor(initialConfig?: DomainMapConfig) {
        if (initialConfig) {
            for (const [domain, tools] of Object.entries(initialConfig)) {
                this.registerDomainTools(domain, tools)
            }
        }
    }

    public registerDomainTools(domain: string, tools: ToolDefinition[]): void {
        if (!this.domainMap.has(domain)) {
            this.domainMap.set(domain, new Map())
        }

        const domainTools = this.domainMap.get(domain)!

        for (const tool of tools) {
            // Dedupes by tool name implicitly through Map
            domainTools.set(tool.name, tool)
        }
    }

    public getToolsForDomain(domain: string): LeanToolDescription[] {
        const domainTools = this.domainMap.get(domain)

        if (!domainTools) {
            return []
        }

        const results: LeanToolDescription[] = []

        for (const tool of domainTools.values()) {
            results.push({
                name: tool.name,
                schema: tool.schema
            })
        }

        return results.sort((a, b) => a.name.localeCompare(b.name)) // deterministic order
    }
}
