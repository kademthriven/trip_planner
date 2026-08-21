import neo4j from "neo4j-driver";
import { config, requireDatabaseConfig } from "./config.js";
import { bidirectionalRoads, experiences, interests, places, travelers } from "./data.js";

requireDatabaseConfig();

const driver = neo4j.driver(
  config.neo4j.uri,
  neo4j.auth.basic(config.neo4j.username, config.neo4j.password),
  { maxConnectionPoolSize: 5 },
);

const write = async (query, parameters = {}) => {
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    await session.executeWrite((tx) => tx.run(query, parameters));
  } finally {
    await session.close();
  }
};

const constraints = [
  "CREATE CONSTRAINT place_id IF NOT EXISTS FOR (node:Place) REQUIRE node.id IS UNIQUE",
  "CREATE CONSTRAINT experience_id IF NOT EXISTS FOR (node:Experience) REQUIRE node.id IS UNIQUE",
  "CREATE CONSTRAINT interest_id IF NOT EXISTS FOR (node:Interest) REQUIRE node.id IS UNIQUE",
  "CREATE CONSTRAINT traveler_id IF NOT EXISTS FOR (node:Traveler) REQUIRE node.id IS UNIQUE",
  "CREATE CONSTRAINT rider_id IF NOT EXISTS FOR (node:Rider) REQUIRE node.id IS UNIQUE",
  "CREATE CONSTRAINT rider_email IF NOT EXISTS FOR (node:Rider) REQUIRE node.email IS UNIQUE",
  "CREATE CONSTRAINT ride_photo_id IF NOT EXISTS FOR (node:RidePhoto) REQUIRE node.id IS UNIQUE",
];

try {
  await driver.verifyConnectivity();
  for (const statement of constraints) {
    try {
      await write(statement);
    } catch (error) {
      console.warn(`Constraint skipped: ${error.message}`);
    }
  }

  // Replace only the curated public travel graph. Rider accounts, saved trips,
  // journals and photos use different labels and are deliberately preserved.
  await write(
    "MATCH (node) WHERE node:Place OR node:Experience OR node:Interest OR node:Traveler DETACH DELETE node",
  );

  await write(
    `UNWIND $rows AS row
     MERGE (node:Place {id: row.id})
     SET node += row`,
    { rows: places },
  );
  await write(
    `UNWIND $rows AS row
     MERGE (node:Interest {id: row.id})
     SET node += row`,
    { rows: interests },
  );
  await write(
    `UNWIND $rows AS row
     MERGE (node:Experience {id: row.id})
     SET node.name = row.name,
         node.category = row.category,
         node.durationMins = row.durationMins,
         node.cost = row.cost,
         node.description = row.description
     WITH node, row
     MATCH (place:Place {id: row.placeId})
     MERGE (place)-[:HOSTS]->(node)
     WITH node, row
     UNWIND row.tags AS tagId
     MATCH (tag:Interest {id: tagId})
     MERGE (node)-[:TAGGED]->(tag)`,
    { rows: experiences },
  );
  await write(
    `UNWIND $rows AS row
     MATCH (from:Place {id: row.from}), (to:Place {id: row.to})
     MERGE (from)-[road:ROAD {name: row.name}]->(to)
     SET road.distanceKm = row.distanceKm,
         road.minutes = row.minutes,
         road.scenicScore = row.scenicScore,
         road.character = row.character`,
    { rows: bidirectionalRoads },
  );
  await write(
    `UNWIND $rows AS row
     MERGE (traveler:Traveler {id: row.id})
     SET traveler.name = row.name, traveler.persona = row.persona
     WITH traveler, row
     UNWIND row.loves AS interestId
     MATCH (interest:Interest {id: interestId})
     MERGE (traveler)-[:LOVES]->(interest)`,
    { rows: travelers },
  );
  await write(
    `UNWIND $rows AS row
     MATCH (traveler:Traveler {id: row.id})
     UNWIND row.saved AS saved
     MATCH (experience:Experience {id: saved.experienceId})
     MERGE (traveler)-[relation:SAVED]->(experience)
     SET relation.rating = saved.rating`,
    { rows: travelers },
  );

  console.log(
    `Seed complete: ${places.length} places, ${experiences.length} experiences, ${interests.length} interests, ${bidirectionalRoads.length} directed roads.`,
  );
} catch (error) {
  console.error(`Seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await driver.close();
}
