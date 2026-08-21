import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 8787),
  neo4j: {
    uri: process.env.NEO4J_URI,
    username: process.env.NEO4J_USERNAME || "cognodb",
    password: process.env.NEO4J_PASSWORD,
  },
  demoMode:
    process.env.DEMO_MODE === "true" ||
    !process.env.NEO4J_URI ||
    !process.env.NEO4J_PASSWORD,
};

export function requireDatabaseConfig() {
  const missing = [
    ["NEO4J_URI", config.neo4j.uri],
    ["NEO4J_PASSWORD", config.neo4j.password],
  ].filter(([, value]) => !value);
  if (missing.length) {
    throw new Error(`Missing database configuration: ${missing.map(([key]) => key).join(", ")}`);
  }
}
