import { bidirectionalRoads, experiences, interests, places, travelers } from "./data.js";

const byId = (items) => new Map(items.map((item) => [item.id, item]));
const placeIndex = byId(places);
const interestIndex = byId(interests);
const experienceIndex = byId(experiences);

const decorateExperience = (experience) => {
  const tags = experience.tags.map((id) => interestIndex.get(id));
  return { experience, place: placeIndex.get(experience.placeId), tags };
};

export class DemoRepository {
  constructor() {
    this.mode = "demo";
    this.riders = new Map();
    this.riderStates = new Map();
    this.photos = new Map();
  }

  async verify() {
    return true;
  }

  async bootstrap() {
    return {
      places,
      interests,
      featured: experiences.slice(0, 6).map(decorateExperience),
    };
  }

  async planRoute({ from, to, interests: wanted, maxHops = 6 }) {
    const adjacency = new Map();
    for (const road of bidirectionalRoads) {
      if (!adjacency.has(road.from)) adjacency.set(road.from, []);
      adjacency.get(road.from).push(road);
    }

    const found = [];
    const walk = (current, visited, legs) => {
      if (legs.length > maxHops || found.length > 80) return;
      if (current === to && legs.length) {
        found.push({ visited: [...visited], legs: [...legs] });
        return;
      }
      for (const road of adjacency.get(current) || []) {
        if (!visited.includes(road.to)) walk(road.to, [...visited, road.to], [...legs, road]);
      }
    };
    walk(from, [from], []);

    const routeRows = found
      .map(({ visited, legs }) => ({
        stops: visited.map((id) => placeIndex.get(id)),
        legs: legs.map((leg) => ({
          name: leg.name,
          distanceKm: leg.distanceKm,
          minutes: leg.minutes,
          scenicScore: leg.scenicScore,
          character: leg.character,
        })),
        distanceKm: legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
        minutes: legs.reduce((sum, leg) => sum + leg.minutes, 0),
        scenicScore: Number((legs.reduce((sum, leg) => sum + leg.scenicScore, 0) / legs.length).toFixed(1)),
      }))
      .sort((a, b) => b.scenicScore - a.scenicScore || a.distanceKm - b.distanceKm)
      .slice(0, 4);

    const routePlaceIds = new Set(routeRows.flatMap((route) => route.stops.map((stop) => stop.id)));
    const recommendations = experiences
      .filter((experience) => routePlaceIds.has(experience.placeId))
      .map((experience) => {
        const matchedIds = experience.tags.filter((tag) => wanted.includes(tag));
        const kindred = travelers.filter(
          (traveler) =>
            traveler.loves.some((tag) => matchedIds.includes(tag)) &&
            traveler.saved.some((saved) => saved.experienceId === experience.id),
        );
        const ratings = kindred.flatMap((traveler) =>
          traveler.saved.filter((saved) => saved.experienceId === experience.id).map((saved) => saved.rating),
        );
        return {
          ...decorateExperience(experience),
          matched: matchedIds.map((id) => interestIndex.get(id)),
          kindredCount: kindred.length,
          communityRating: ratings.length
            ? Number((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1))
            : null,
        };
      })
      .filter((item) => item.matched.length)
      .sort((a, b) => b.matched.length - a.matched.length || (b.communityRating || 0) - (a.communityRating || 0))
      .slice(0, 12);

    return {
      routes: routeRows.map((route, index) => ({
        id: `route-${index + 1}`,
        ...route,
        fitScore: Math.min(98, Math.round(route.scenicScore * 7 + recommendations.length * 2)),
      })),
      recommendations,
    };
  }

  async related(experienceId) {
    const seed = experienceIndex.get(experienceId);
    if (!seed) return [];
    return experiences
      .filter((item) => item.id !== seed.id)
      .map((experience) => {
        const sharedIds = experience.tags.filter((tag) => seed.tags.includes(tag));
        const fellowTravelers = travelers.filter(
          (traveler) =>
            traveler.saved.some((saved) => saved.experienceId === seed.id) &&
            traveler.saved.some((saved) => saved.experienceId === experience.id),
        );
        const ratings = fellowTravelers.flatMap((traveler) =>
          traveler.saved.filter((saved) => saved.experienceId === experience.id).map((saved) => saved.rating),
        );
        return {
          seed,
          experience,
          place: placeIndex.get(experience.placeId),
          sharedInterests: sharedIds.map((id) => interestIndex.get(id)),
          fellowTravelers: fellowTravelers.length,
          rating: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null,
        };
      })
      .filter((item) => item.sharedInterests.length)
      .sort((a, b) => b.sharedInterests.length - a.sharedInterests.length || b.fellowTravelers - a.fellowTravelers)
      .slice(0, 6);
  }

  async findRiderByEmail(email) {
    return [...this.riders.values()].find((rider) => rider.email === email) || null;
  }

  async createRider(rider) {
    this.riders.set(rider.id, { ...rider });
    return { ...rider };
  }

  async getRiderState(riderId) {
    return this.riderStates.get(riderId) || null;
  }

  async saveRiderState(riderId, state) {
    if (!this.riders.has(riderId)) return false;
    this.riderStates.set(riderId, { ...state });
    return true;
  }

  async getRidePhotos(riderId, historyId) {
    return [...this.photos.values()]
      .filter((photo) => photo.riderId === riderId && photo.historyId === historyId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createRidePhoto(photo) {
    this.photos.set(photo.id, { ...photo });
    return { ...photo, userId: photo.riderId };
  }

  async deleteRidePhoto(riderId, photoId) {
    const photo = this.photos.get(photoId);
    if (!photo || photo.riderId !== riderId) return null;
    this.photos.delete(photoId);
    return photo;
  }
}
