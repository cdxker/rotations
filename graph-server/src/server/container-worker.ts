import { Container } from "@cloudflare/containers";

interface Env {
    GRAPH_API_CONTAINER: DurableObjectNamespace<GraphApiContainer>;
    DATABASE_URL: string;
}

export class GraphApiContainer extends Container<Env> {
    defaultPort = 8080;
    sleepAfter = "30m" as const;

    constructor(ctx: DurableObject["ctx"], env: Env) {
        super(ctx, env);
        this.envVars = {
            DATABASE_URL: env.DATABASE_URL,
        };
    }
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const id = env.GRAPH_API_CONTAINER.idFromName("graph-api");
        const container = env.GRAPH_API_CONTAINER.get(id);
        return container.fetch(request);
    },
};
