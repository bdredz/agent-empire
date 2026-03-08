export interface ToolDefinition {
    readonly name: string
    readonly domain: string
    readonly description: string
    readonly schema: Record<string, unknown>
    readonly mcpEndpoint?: string
}

export interface IToolDiscoveryService {
    register(tool: ToolDefinition): void
    discover(domain: string): ToolDefinition[]
    discoverForTask(taskType: string): ToolDefinition[]
}

export class ToolDiscoveryService implements IToolDiscoveryService {
    private readonly toolRegistry = new Map<string, ToolDefinition>()

    // Minimal static mapping of tasks to domains for deterministic routing
    private readonly taskToDomainMap: Record<string, string[]> = {
        'implement_feature': ['code_generation', 'git_ops'],
        'data_scraping': ['web_scraping', 'data_transform'],
        'content_creation': ['content_generation', 'summarization'],
        'lead_management': ['lead_tracking', 'api_integration']
    }

    public register(tool: ToolDefinition): void {
        // If a tool with the same name already exists, it is overwritten (handles deduplication/updates)
        this.toolRegistry.set(tool.name, tool)
    }

    public discover(domain: string): ToolDefinition[] {
        const results: ToolDefinition[] = []

        for (const tool of this.toolRegistry.values()) {
            if (tool.domain === domain) {
                results.push(tool)
            }
        }

        return results.sort((a, b) => a.name.localeCompare(b.name))
    }

    public discoverForTask(taskType: string): ToolDefinition[] {
        const domains = this.taskToDomainMap[taskType]

        // If task type is unknown, return empty instead of all (fail closed/secure)
        if (!domains || domains.length === 0) {
            return []
        }

        const results: ToolDefinition[] = []

        for (const tool of this.toolRegistry.values()) {
            if (domains.includes(tool.domain)) {
                results.push(tool)
            }
        }

        return results.sort((a, b) => a.name.localeCompare(b.name))
    }
}
