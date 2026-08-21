import neo4j from "neo4j-driver";
import {
  bootstrapQuery,
  createPhotoQuery,
  createRiderQuery,
  deletePhotoQuery,
  recommendationsQuery,
  relatedQuery,
  riderByEmailQuery,
  riderPhotosQuery,
  riderStateQuery,
  routeQuery,
  saveRiderStateQuery,
} from "./queries.js";

const normalize = (value) => {
  if (neo4j.isInt(value)) return value.inSafeRange() ? value.toNumber() : value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
};

const records = (result) => result.records.map((record) => normalize(record.toObject()));

export class Neo4jRepository {
  constructor(connection) {
    this.driver = neo4j.driver(
      connection.uri,
      neo4j.auth.basic(connection.username, connection.password),
      { maxConnectionPoolSize: 20, connectionAcquisitionTimeout: 8000 },
    );
    this.mode = "cognodb";
  }

  async verify() {
    await this.driver.verifyConnectivity();
    return true;
  }

  async read(query, parameters = {}) {
    const session = this.driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      return await session.executeRead((tx) => tx.run(query, parameters));
    } finally {
      await session.close();
    }
  }

  async write(query, parameters = {}) {
    const session = this.driver.session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      return await session.executeWrite((tx) => tx.run(query, parameters));
    } finally {
      await session.close();
    }
  }

  async bootstrap() {
    const [data] = records(await this.read(bootstrapQuery));
    return data || { places: [], interests: [], featured: [] };
  }

  async planRoute({ from, to, interests, maxHops = 6 }) {
    const routeRows = records(
      await this.read(routeQuery, { from, to, maxHops: neo4j.int(maxHops) }),
    );
    const placeIds = [...new Set(routeRows.flatMap((row) => row.stops.map((stop) => stop.id)))];
    const recommendations = placeIds.length
      ? records(await this.read(recommendationsQuery, { placeIds, interests }))
      : [];

    return {
      routes: routeRows.map((row, index) => ({
        id: `route-${index + 1}`,
        ...row,
        fitScore: Math.round(row.scenicScore * 7 + Math.min(30, recommendations.length * 2)),
      })),
      recommendations,
    };
  }

  async related(experienceId) {
    return records(await this.read(relatedQuery, { experienceId }));
  }

  async findRiderByEmail(email) {
    return records(await this.read(riderByEmailQuery, { email }))[0]?.rider || null;
  }

  async createRider(rider) {
    return records(await this.write(createRiderQuery, rider))[0]?.rider || null;
  }

  async getRiderState(riderId) {
    return records(await this.read(riderStateQuery, { riderId }))[0] || null;
  }

  async saveRiderState(riderId, state) {
    const rows = records(await this.write(saveRiderStateQuery, { riderId, ...state }));
    return Boolean(rows[0]?.riderId);
  }

  async getRidePhotos(riderId, historyId) {
    return records(await this.read(riderPhotosQuery, { riderId, historyId })).map((row) => row.photo);
  }

  async createRidePhoto(photo) {
    return records(await this.write(createPhotoQuery, photo))[0]?.photo || null;
  }

  async deleteRidePhoto(riderId, photoId) {
    return records(await this.write(deletePhotoQuery, { riderId, photoId }))[0]?.deleted || null;
  }

  async close() {
    await this.driver.close();
  }
}
