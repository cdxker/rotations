import { Pool } from "pg";

export const TEST_DATABASE_URL =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/graph";

export async function resetTestDatabase(): Promise<void> {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    try {
        await pool.query(`
            DO $$
            BEGIN
                IF to_regclass('public.users') IS NOT NULL THEN
                    TRUNCATE TABLE edges, nodes, metadata, pipeline_jobs, users RESTART IDENTITY CASCADE;
                END IF;
            END
            $$;
        `);
    } finally {
        await pool.end();
    }
}
