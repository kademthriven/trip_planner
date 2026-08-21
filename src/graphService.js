const COLORS = ["#e7fe52", "#63d4ee", "#ffad63", "#aa92ef"];
const NAMES = ["Graph scenic route", "Heritage backroad", "Rider discovery path", "Connected detour"];

let bootstrapPromise;
const graphBootstrap = () => {
  if (!bootstrapPromise) {
    bootstrapPromise = fetch("/api/bootstrap").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "CognoDB graph is unavailable.");
      return data;
    });
  }
  return bootstrapPromise;
};

const distanceKm = (a, b) => {
  const radians = (value) => (value * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians((b.lng ?? b.lon) - (a.lng ?? a.lon));
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const nearestGraphPlace = (point, places) => {
  const ranked = places
    .map((place) => ({ place, distance: distanceKm(point, place) }))
    .sort((a, b) => a.distance - b.distance);
  return ranked[0]?.distance <= 85 ? ranked[0].place : null;
};

const graphRecommendationPlace = (item) => ({
  id: `graph-${item.experience.id}`,
  graphExperienceId: item.experience.id,
  name: item.experience.name,
  category: item.experience.category === "food" ? "food" : "attraction",
  type: item.experience.category,
  lat: item.place.lat,
  lon: item.place.lng,
  estimate: item.experience.cost,
  openingHours: null,
  website: null,
  phone: null,
  image: item.experience.category === "food" ? "/place-images/food.svg" : "/place-images/attraction.svg",
  imageAlt: `${item.experience.name} near ${item.place.name}`,
  imageAttribution: "CognoDB travel graph",
  graphMatchedInterests: item.matched.map((interest) => interest.name),
  graphKindredCount: item.kindredCount,
  graphDescription: item.experience.description,
  tags: {},
});

export const getCognoGraphJourney = async (from, to, settings) => {
  try {
    const bootstrap = await graphBootstrap();
    const origin = nearestGraphPlace(from, bootstrap.places);
    const destination = nearestGraphPlace(to, bootstrap.places);
    if (!origin || !destination || origin.id === destination.id) {
      return { routes: [], places: [], mode: bootstrap.mode };
    }
    const response = await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: origin.id,
        to: destination.id,
        interests: ["scenic-rides", "viewpoints", "heritage", "local-food", "photography"],
        maxHops: 6,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Graph routing failed.");
    const routes = data.routes.map((route, index) => {
      const coordinates = route.stops.map((stop) => [stop.lng, stop.lat]);
      return {
        id: `cognodb-${route.id}`,
        name: NAMES[index] || `Graph route ${index + 1}`,
        note: `${route.stops.length} connected places · ${route.fitScore}% interest fit`,
        traffic: "CognoDB traversal",
        color: COLORS[index] || COLORS[0],
        distanceKm: route.distanceKm,
        durationMinutes: route.minutes,
        fuelOneWay: (route.distanceKm / Math.max(1, settings.mileage)) * settings.fuelPrice,
        provider: "CognoDB multi-hop graph",
        graphPath: true,
        graphFitScore: route.fitScore,
        graphScenicScore: route.scenicScore,
        graphStops: route.stops,
        road: route.legs.map((leg) => leg.name).join(" → "),
        steps: route.legs.map((leg, legIndex) => ({
          instruction: `Take ${leg.name} toward ${route.stops[legIndex + 1].name}`,
          distance: leg.distanceKm * 1000,
          duration: leg.minutes * 60,
          location: coordinates[legIndex + 1],
        })),
        geometry: { type: "LineString", coordinates },
        sampledCoordinates: coordinates,
      };
    });
    return {
      routes,
      places: data.recommendations.map(graphRecommendationPlace),
      mode: data.mode,
    };
  } catch {
    return { routes: [], places: [], mode: "unavailable" };
  }
};
