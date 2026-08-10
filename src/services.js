const PHOTON_URL = "https://photon.komoot.io";
const OSRM_URL = "https://router.project-osrm.org";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const ELEVATION_URL = "https://api.open-meteo.com/v1/elevation";
const VALHALLA_URL = "https://valhalla1.openstreetmap.de/route";
const WIKIPEDIA_URL = "https://en.wikipedia.org/w/api.php";
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const fetchJson = async (url, options = {}, timeout = 18000) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
};

const placePhotoFallbacks = {
  attraction: "/place-images/attraction.svg",
  food: "/place-images/food.svg",
  stay: "/place-images/stay.svg",
  fuel: "/place-images/fuel.svg",
  service: "/place-images/service.svg",
  hospital: "/place-images/hospital.svg",
};

export const fallbackPlacePhoto = (category = "attraction") =>
  placePhotoFallbacks[category] || placePhotoFallbacks.attraction;

const usefulWords = (value) =>
  String(value || "")
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g)
    ?.filter(
      (word) =>
        ![
          "hotel",
          "restaurant",
          "hills",
          "station",
          "temple",
          "viewpoint",
          "local",
        ].includes(word),
    ) || [];

const plainText = (value) =>
  String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const wikipediaPhoto = async (query, expectedName) => {
  const params = new URLSearchParams({
    origin: "*",
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "0",
    gsrlimit: "1",
    prop: "pageimages|pageterms",
    piprop: "thumbnail",
    pithumbsize: "900",
    wbptterms: "description",
  });
  const data = await fetchJson(`${WIKIPEDIA_URL}?${params}`, {}, 10000);
  const page = Object.values(data.query?.pages || {})[0];
  if (!page?.thumbnail?.source) return null;
  const expectedWords = usefulWords(expectedName);
  const titleWords = usefulWords(page.title);
  if (
    expectedWords.length &&
    !expectedWords.some((word) => titleWords.includes(word))
  )
    return null;
  return {
    image: page.thumbnail.source,
    imageAlt: page.terms?.description?.[0] || query,
    imageAttribution: "Wikipedia / Wikimedia Commons",
    imagePage: `https://en.wikipedia.org/?curid=${page.pageid}`,
  };
};

export const getDestinationPhoto = async (destination) => {
  const cacheKey = `rove-destination-photo-${destination.name}`;
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
    if (cached?.image) return cached;
  } catch {
    /* Image caching is optional. */
  }
  let result;
  try {
    result = await wikipediaPhoto(
      `${destination.name} ${destination.subtitle || ""}`.trim(),
      destination.name,
    );
  } catch {
    /* Use the visual fallback. */
  }
  const photo = result || {
    image: fallbackPlacePhoto("attraction"),
    imageAlt: `${destination.name} destination`,
    imageAttribution: "Rove destination artwork",
  };
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(photo));
  } catch {
    /* Image caching is optional. */
  }
  return photo;
};

const taggedPlacePhoto = (place) => {
  const image = place.tags?.image || place.tags?.["contact:image"];
  if (!/^https:\/\//i.test(image || "")) return null;
  return {
    image,
    imageAlt: `${place.name} location photo`,
    imageAttribution: "Photo linked by OpenStreetMap",
    imagePage: image,
    imageSource: "osm-tagged-image",
  };
};

const commonsNamedPhoto = async (place, destination) => {
  const placeWords = usefulWords(place.name);
  if (!placeWords.length || place.planningFallback) return null;
  const cacheKey = `rove-commons-name-v1-${place.name}-${destination.name}`;
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
    if (cached?.image) return cached;
    if (cached?.miss && cached.time > Date.now() - 30 * 60 * 1000) return null;
  } catch {
    /* Image caching is optional. */
  }
  const params = new URLSearchParams({
    origin: "*",
    action: "query",
    format: "json",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "10",
    gsrsearch: `"${place.name}" ${destination.name}`,
    prop: "coordinates|imageinfo",
    colimit: "max",
    iilimit: "1",
    iiprop: "url|mime|timestamp|extmetadata",
    iiurlwidth: "900",
  });
  const data = await fetchJson(
    `https://commons.wikimedia.org/w/api.php?${params}`,
    {},
    14000,
  );
  const destinationWords = usefulWords(destination.name);
  const requiredMatches = placeWords.length >= 3 ? 2 : 1;
  const candidates = Object.values(data.query?.pages || {})
    .map((page) => {
      const info = page.imageinfo?.[0];
      if (!info?.mime?.startsWith("image/") || info.mime === "image/svg+xml")
        return null;
      const image = info.thumburl || info.url;
      if (!image) return null;
      const titleWords = usefulWords(page.title);
      const placeMatches = placeWords.filter((word) =>
        titleWords.includes(word),
      ).length;
      const destinationMatches = destinationWords.filter((word) =>
        titleWords.includes(word),
      ).length;
      const coordinate = page.coordinates?.[0];
      const distanceKm = coordinate
        ? distanceBetween(place, { lat: coordinate.lat, lon: coordinate.lon })
        : null;
      if (
        placeMatches < requiredMatches ||
        (destinationMatches === 0 && (distanceKm == null || distanceKm > 15))
      )
        return null;
      const metadata = info.extmetadata || {};
      return {
        image,
        imageAlt: page.title.replace(/^File:/, "").replace(/\.[^.]+$/, ""),
        imageAttribution:
          distanceKm == null
            ? "Named venue photo · Wikimedia Commons"
            : `${distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} away · Wikimedia Commons`,
        imageCredit: plainText(
          metadata.Artist?.value || metadata.Credit?.value,
        ),
        imageLicense:
          plainText(metadata.LicenseShortName?.value) || "Wikimedia license",
        imagePage: info.descriptionurl,
        imageDistanceKm:
          distanceKm == null ? null : Number(distanceKm.toFixed(2)),
        imageUpdatedAt: info.timestamp,
        imageSource: "wikimedia-name-search",
        score:
          placeMatches * 9 +
          destinationMatches * 4 -
          (distanceKm == null ? 0 : distanceKm * 0.5),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  const photo = candidates[0] || null;
  try {
    sessionStorage.setItem(
      cacheKey,
      JSON.stringify(photo || { miss: true, time: Date.now() }),
    );
  } catch {
    /* Image caching is optional. */
  }
  return photo;
};

const commonsNearbyPhoto = async (
  place,
  destination,
  { areaOnly = false } = {},
) => {
  const businessPlace = ["food", "stay"].includes(place.category) && !areaOnly;
  const cacheKey = `rove-commons-photo-v4-${areaOnly ? "area" : place.category}-${place.lat.toFixed(4)}-${place.lon.toFixed(4)}`;
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
    if (cached?.image) return cached;
    if (cached?.miss && cached.time > Date.now() - 15 * 60 * 1000) return null;
  } catch {
    /* Image caching is optional. */
  }

  const params = new URLSearchParams({
    origin: "*",
    action: "query",
    format: "json",
    generator: "geosearch",
    ggsprimary: "all",
    ggsnamespace: "6",
    ggsradius: businessPlace ? "2000" : "5000",
    ggslimit: "18",
    ggscoord: `${place.lat}|${place.lon}`,
    prop: "coordinates|imageinfo",
    colimit: "max",
    iilimit: "1",
    iiprop: "url|mime|timestamp|extmetadata",
    iiurlwidth: "900",
  });
  const data = await fetchJson(
    `https://commons.wikimedia.org/w/api.php?${params}`,
    {},
    14000,
  );
  const placeWords = usefulWords(place.name);
  const destinationWords = usefulWords(destination.name);
  const scenicPattern =
    /hill|fort|temple|drop|view|sunrise|landscape|falls|palace|monument|peak/i;
  const unrelatedPattern =
    /bird|warbler|pigeon|starling|macaque|monkey|ape|squirrel|insect|flower|portrait|selfie|person/i;
  const candidates = Object.values(data.query?.pages || {})
    .map((page) => {
      const info = page.imageinfo?.[0];
      const coordinate = page.coordinates?.[0];
      if (!info?.mime?.startsWith("image/") || !coordinate) return null;
      const image = info.thumburl || info.url;
      if (!image || info.mime === "image/svg+xml") return null;
      const distanceKm = distanceBetween(place, {
        lat: coordinate.lat,
        lon: coordinate.lon,
      });
      const titleWords = usefulWords(page.title);
      const placeMatches = placeWords.filter((word) =>
        titleWords.includes(word),
      ).length;
      const destinationMatches = destinationWords.filter((word) =>
        titleWords.includes(word),
      ).length;
      const score =
        placeMatches * 7 +
        destinationMatches * 3 +
        (scenicPattern.test(page.title) ? 2 : 0) -
        (unrelatedPattern.test(page.title) ? 12 : 0) -
        distanceKm * 1.5;
      const metadata = info.extmetadata || {};
      return {
        image,
        imageAlt: page.title.replace(/^File:/, "").replace(/\.[^.]+$/, ""),
        imageAttribution: `${areaOnly ? "Area photo · " : ""}${distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} away · Wikimedia Commons`,
        imageCredit: plainText(
          metadata.Artist?.value || metadata.Credit?.value,
        ),
        imageLicense:
          plainText(metadata.LicenseShortName?.value) || "Wikimedia license",
        imagePage: info.descriptionurl,
        imageDistanceKm: Number(distanceKm.toFixed(2)),
        imageUpdatedAt: info.timestamp,
        imageSource: areaOnly ? "wikimedia-area" : "wikimedia-geosearch",
        placeMatches,
        score,
      };
    })
    .filter(Boolean)
    .filter((candidate) =>
      areaOnly
        ? candidate.imageDistanceKm <= 5
        : businessPlace
          ? candidate.imageDistanceKm <= 2 && candidate.placeMatches > 0
          : candidate.imageDistanceKm <= 5,
    )
    .sort((a, b) => b.score - a.score);
  const photo = candidates[0] || null;
  try {
    sessionStorage.setItem(
      cacheKey,
      JSON.stringify(photo || { miss: true, time: Date.now() }),
    );
  } catch {
    /* Image caching is optional. */
  }
  return photo;
};

export const enrichPlacesWithPhotos = async (places, destination) => {
  const enriched = [];
  for (let offset = 0; offset < places.length; offset += 4) {
    const batch = await Promise.all(
      places.slice(offset, offset + 4).map(async (place, batchIndex) => {
        const index = offset + batchIndex;
        const fallback = {
          image: fallbackPlacePhoto(place.category),
          imageAlt: `${place.category} near ${destination.name}`,
          imageAttribution: "Rove category artwork",
        };
        const taggedPhoto = taggedPlacePhoto(place);
        if (taggedPhoto) return { ...place, ...taggedPhoto };
        if (
          index >= 22 ||
          !["attraction", "food", "stay"].includes(place.category)
        )
          return { ...place, ...fallback };
        try {
          if (place.planningFallback) {
            const areaPhoto = await commonsNearbyPhoto(place, destination, {
              areaOnly: true,
            });
            return { ...place, ...(areaPhoto || fallback) };
          }
          if (["food", "stay"].includes(place.category)) {
            const namedBusinessPhoto = await commonsNamedPhoto(
              place,
              destination,
            );
            if (namedBusinessPhoto) return { ...place, ...namedBusinessPhoto };
            const exactNearbyPhoto = await commonsNearbyPhoto(
              place,
              destination,
            );
            return { ...place, ...(exactNearbyPhoto || fallback) };
          }
          const nearbyPhoto = await commonsNearbyPhoto(place, destination);
          if (nearbyPhoto) return { ...place, ...nearbyPhoto };
          const namedPhoto = await wikipediaPhoto(
            `${place.name} ${destination.name}`,
            place.name,
          );
          return { ...place, ...(namedPhoto || fallback) };
        } catch {
          return { ...place, ...fallback };
        }
      }),
    );
    enriched.push(...batch);
  }
  return enriched;
};

export const DEFAULT_START = {
  name: "Bengaluru",
  subtitle: "Karnataka, India",
  lat: 12.9716,
  lon: 77.5946,
};

export const DEFAULT_END = {
  name: "Nandi Hills",
  subtitle: "Chikkaballapur, Karnataka",
  lat: 13.3702,
  lon: 77.6835,
};

export const geocode = async (query, bias) => {
  if (!query?.trim()) return [];
  const params = new URLSearchParams({
    q: query.trim(),
    limit: "5",
    lang: "en",
  });
  if (bias?.lat && bias?.lon) {
    params.set("lat", bias.lat);
    params.set("lon", bias.lon);
    params.set("zoom", "10");
  }
  const data = await fetchJson(`${PHOTON_URL}/api/?${params}`);
  return (data.features || []).map((feature) => {
    const props = feature.properties || {};
    const [lon, lat] = feature.geometry.coordinates;
    const subtitle = [
      props.district,
      props.city,
      props.county,
      props.state,
      props.country,
    ]
      .filter(Boolean)
      .filter(
        (value, index, array) =>
          array.indexOf(value) === index && value !== props.name,
      )
      .slice(0, 3)
      .join(", ");
    return {
      name: props.name || props.city || "Selected place",
      subtitle,
      lat,
      lon,
      osmType: props.osm_type,
      osmId: props.osm_id,
    };
  });
};

export const reverseGeocode = async (lat, lon) => {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    limit: "1",
    lang: "en",
  });
  const data = await fetchJson(`${PHOTON_URL}/reverse?${params}`);
  const feature = data.features?.[0];
  if (!feature)
    return {
      name: "Current location",
      subtitle: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      lat,
      lon,
    };
  const props = feature.properties || {};
  return {
    name: props.name || props.street || props.city || "Current location",
    subtitle: [props.city, props.state, props.country]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i && v !== props.name)
      .join(", "),
    lat,
    lon,
  };
};

export const getApproximateLocation = async () => {
  const providers = [
    async () => {
      const data = await fetchJson("https://ipwho.is/", {}, 8000);
      if (data.success === false) throw new Error("Network location failed.");
      return {
        lat: Number(data.latitude),
        lon: Number(data.longitude),
        city: data.city,
        region: data.region,
        country: data.country,
      };
    },
    async () => {
      const data = await fetchJson("https://ipapi.co/json/", {}, 8000);
      return {
        lat: Number(data.latitude),
        lon: Number(data.longitude),
        city: data.city,
        region: data.region,
        country: data.country_name,
      };
    },
  ];

  for (const provider of providers) {
    try {
      const result = await provider();
      if (!Number.isFinite(result.lat) || !Number.isFinite(result.lon))
        continue;
      return {
        place: {
          name: result.city || result.region || "Approximate location",
          subtitle: [result.region, result.country]
            .filter(Boolean)
            .filter((value, index, values) => values.indexOf(value) === index)
            .join(", "),
          lat: result.lat,
          lon: result.lon,
        },
        position: {
          lat: result.lat,
          lon: result.lon,
          accuracy: null,
          heading: null,
          speed: null,
          approximate: true,
        },
      };
    } catch {
      /* Try the next network-location provider. */
    }
  }
  throw new Error("Approximate network location is unavailable.");
};

const routePersonality = [
  {
    id: "fast",
    name: "Fastest route",
    note: "Shortest travel time",
    traffic: "Live traffic unavailable",
    color: "#63e6ff",
  },
  {
    id: "scenic",
    name: "Scenic alternative",
    note: "More road, more views",
    traffic: "Relaxed pace",
    color: "#e7fe52",
  },
  {
    id: "budget",
    name: "Fuel saver",
    note: "Lowest fuel estimate",
    traffic: "Efficient route",
    color: "#ffb15a",
  },
];

const sampleLine = (coordinates, maxPoints = 90) => {
  if (coordinates.length <= maxPoints) return coordinates;
  const step = Math.ceil(coordinates.length / maxPoints);
  return coordinates.filter(
    (_, index) => index % step === 0 || index === coordinates.length - 1,
  );
};

const decodeValhallaShape = (encoded, precision = 6) => {
  let index = 0;
  let lat = 0;
  let lon = 0;
  const coordinates = [];
  const factor = 10 ** precision;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lon / factor, lat / factor]);
  }
  return coordinates;
};

const getValhallaRoutes = async (start, end, settings) => {
  const costing =
    settings.bikeId === "scooter" ? "motor_scooter" : "motorcycle";
  const variants =
    costing === "motor_scooter"
      ? [
          { use_primary: 0.65, use_hills: 0.45, top_speed: 90 },
          { use_primary: 0.25, use_hills: 0.25, top_speed: 75 },
        ]
      : [
          { use_highways: 0.55, use_tolls: 0.15, use_trails: 0.05 },
          { use_highways: 0.12, use_tolls: 0, use_trails: 0.22 },
        ];
  const responses = await Promise.allSettled(
    variants.map((options) =>
      fetchJson(
        VALHALLA_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locations: [
              { lat: start.lat, lon: start.lon },
              { lat: end.lat, lon: end.lon },
            ],
            costing,
            costing_options: { [costing]: options },
            units: "kilometers",
            directions_options: { units: "kilometers", narrative: true },
          }),
        },
        28000,
      ),
    ),
  );
  const successful = responses
    .filter(
      (result) =>
        result.status === "fulfilled" && result.value.trip?.legs?.length,
    )
    .map((result) => result.value);
  if (!successful.length) throw new Error("Motorcycle routing is unavailable.");
  return successful.map((data, index) => {
    const info = routePersonality[index] || routePersonality[1];
    const summary = data.trip.summary;
    const coordinates = data.trip.legs.flatMap((leg, legIndex) => {
      const decoded = decodeValhallaShape(leg.shape);
      return legIndex ? decoded.slice(1) : decoded;
    });
    const maneuvers = data.trip.legs.flatMap((leg) => leg.maneuvers || []);
    const distanceKm = summary.length;
    return {
      ...info,
      id: `${info.id}-moto-${index}`,
      name:
        index === 0 ? "Fastest two-wheeler route" : "Scenic two-wheeler route",
      note:
        index === 0
          ? "Motorcycle-optimized travel time"
          : "Avoids highways and tolls where possible",
      traffic: `${costing.replace("_", " ")} profile`,
      provider: "Valhalla two-wheeler",
      distanceKm,
      durationMinutes: Math.round(summary.time / 60),
      fuelOneWay: (distanceKm / settings.mileage) * settings.fuelPrice,
      geometry: { type: "LineString", coordinates },
      sampledCoordinates: sampleLine(coordinates),
      steps: maneuvers.map((maneuver) => ({
        instruction: maneuver.instruction,
        distance: maneuver.length * 1000,
        duration: maneuver.time,
        location: coordinates[maneuver.begin_shape_index],
      })),
      road:
        maneuvers.find((maneuver) => maneuver.street_names?.length)
          ?.street_names?.[0] || "motorcycle-friendly roads",
    };
  });
};

const getOsrmRoutes = async (start, end, settings) => {
  const coords = `${start.lon},${start.lat};${end.lon},${end.lat}`;
  const params = new URLSearchParams({
    alternatives: "true",
    steps: "true",
    geometries: "geojson",
    overview: "full",
  });
  const data = await fetchJson(
    `${OSRM_URL}/route/v1/driving/${coords}?${params}`,
    {},
    25000,
  );
  if (!data.routes?.length)
    throw new Error("No rideable route was found between those places.");
  const converted = data.routes.map((route, index) => {
    const info = routePersonality[index] || routePersonality[1];
    const distanceKm = route.distance / 1000;
    const fuelOneWay = (distanceKm / settings.mileage) * settings.fuelPrice;
    return {
      ...info,
      id: `${info.id}-${index}`,
      distanceKm,
      durationMinutes: Math.round(route.duration / 60),
      fuelOneWay,
      provider: "Road-network fallback",
      geometry: route.geometry,
      steps: (route.legs?.[0]?.steps || [])
        .filter((step) => step.distance > 20)
        .map((step) => ({
          instruction:
            [step.maneuver?.modifier, step.name ? `onto ${step.name}` : ""]
              .filter(Boolean)
              .join(" ") ||
            step.maneuver?.type ||
            "Continue",
          distance: step.distance,
          duration: step.duration,
          location: step.maneuver?.location,
        })),
      road:
        route.legs?.[0]?.steps?.find((step) => step.name)?.name || "main roads",
      sampledCoordinates: sampleLine(route.geometry.coordinates),
    };
  });
  if (converted.length === 1) {
    converted[0] = {
      ...converted[0],
      id: "fast-0",
      name: "Best available route",
      note: "Recommended for this ride",
    };
  }
  return converted;
};

export const getRoutes = async (start, end, settings) => {
  try {
    return await getValhallaRoutes(start, end, settings);
  } catch {
    return getOsrmRoutes(start, end, settings);
  }
};

const weatherLabel = (code) => {
  if (code === 0) return { label: "Clear", icon: "sun" };
  if (code <= 3) return { label: "Cloudy", icon: "cloud" };
  if (code <= 48) return { label: "Foggy", icon: "fog" };
  if (code <= 67 || (code >= 80 && code <= 82))
    return { label: "Rain", icon: "rain" };
  if (code <= 77 || (code >= 85 && code <= 86))
    return { label: "Snow", icon: "snow" };
  return { label: "Storm", icon: "storm" };
};

export const getWeather = async (destination) => {
  const params = new URLSearchParams({
    latitude: destination.lat,
    longitude: destination.lon,
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,wind_speed_10m_max",
    timezone: "auto",
    forecast_days: "14",
  });
  const data = await fetchJson(`${WEATHER_URL}?${params}`);
  const daily = data.daily || {};
  return (daily.time || [])
    .map((date, index) => {
      const rain = daily.precipitation_probability_max?.[index] ?? 0;
      const wind = daily.wind_speed_10m_max?.[index] ?? 0;
      const code = daily.weather_code?.[index] ?? 3;
      const max = daily.temperature_2m_max?.[index] ?? 25;
      const min = daily.temperature_2m_min?.[index] ?? 16;
      const comfortPenalty = Math.max(0, max - 29) * 2 + Math.max(0, 11 - min);
      const severityPenalty =
        code >= 51 ? 18 : code >= 45 ? 8 : code > 3 ? 5 : 0;
      const score = Math.max(
        1,
        Math.min(
          10,
          10 -
            rain * 0.055 -
            wind * 0.045 -
            comfortPenalty * 0.08 -
            severityPenalty * 0.1,
        ),
      );
      return {
        date,
        ...weatherLabel(code),
        code,
        max: Math.round(max),
        min: Math.round(min),
        rain: Math.round(rain),
        wind: Math.round(wind),
        sunrise: daily.sunrise?.[index],
        sunset: daily.sunset?.[index],
        visibility: daily.visibility_mean?.[index],
        score: Number(score.toFixed(1)),
      };
    })
    .sort((a, b) => b.score - a.score);
};

const categoryFromTags = (tags = {}) => {
  if (tags.amenity === "fuel") return "fuel";
  if (["restaurant", "cafe", "fast_food", "food_court"].includes(tags.amenity))
    return "food";
  if (
    ["hotel", "hostel", "guest_house", "motel", "camp_site"].includes(
      tags.tourism,
    )
  )
    return "stay";
  if (tags.tourism || ["peak", "waterfall", "viewpoint"].includes(tags.natural))
    return "attraction";
  return "attraction";
};

const priceEstimate = (category, tags, id) => {
  const seed = Number(String(id).slice(-3)) || 47;
  if (category === "fuel") return null;
  if (category === "food") return 120 + (seed % 5) * 60;
  if (category === "stay") {
    const base =
      tags.tourism === "hostel" || tags.tourism === "guest_house" ? 650 : 950;
    return base + (seed % 5) * 180;
  }
  return tags.fee === "yes" ? 100 + (seed % 4) * 50 : 0;
};

const fallbackNearbyPlaces = (destination) =>
  [
    {
      id: "viewpoint",
      name: `${destination.name} scenic viewpoint`,
      category: "attraction",
      type: "viewpoint",
      latOffset: 0.018,
      lonOffset: 0.01,
      estimate: 0,
    },
    {
      id: "heritage",
      name: `${destination.name} local highlight`,
      category: "attraction",
      type: "local_landmark",
      latOffset: -0.012,
      lonOffset: 0.016,
      estimate: 0,
    },
    {
      id: "restaurant",
      name: "Rider-friendly local restaurant",
      category: "food",
      type: "restaurant",
      latOffset: 0.008,
      lonOffset: -0.009,
      estimate: 240,
    },
    {
      id: "cafe",
      name: "Breakfast and tea stop",
      category: "food",
      type: "cafe",
      latOffset: -0.006,
      lonOffset: -0.012,
      estimate: 160,
    },
    {
      id: "stay",
      name: `${destination.name} budget stay`,
      category: "stay",
      type: "guest_house",
      latOffset: 0.011,
      lonOffset: 0.019,
      estimate: 830,
    },
    {
      id: "fuel",
      name: "Suggested nearby petrol stop",
      category: "fuel",
      type: "fuel",
      latOffset: -0.015,
      lonOffset: 0.004,
      estimate: null,
    },
  ].map(({ latOffset, lonOffset, ...place }) => ({
    ...place,
    id: `fallback-${destination.lat}-${destination.lon}-${place.id}`,
    lat: destination.lat + latOffset,
    lon: destination.lon + lonOffset,
    openingHours: null,
    website: null,
    phone: null,
    image: fallbackPlacePhoto(place.category),
    imageAlt: `${place.category} near ${destination.name}`,
    imageAttribution: "Rove category artwork",
    planningFallback: true,
    tags: {},
  }));

export const getNearbyPlaces = async (destination) => {
  const cacheKey = `rove-places-${destination.lat.toFixed(3)}-${destination.lon.toFixed(3)}`;
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
    if (cached?.time > Date.now() - 30 * 60 * 1000 && cached.places?.length)
      return cached.places;
  } catch {
    /* Storage is optional. */
  }
  const searches = [
    ["amenity:restaurant", "food"],
    ["amenity:cafe", "food"],
    ["amenity:fuel", "fuel"],
    ["tourism:hotel", "stay"],
    ["tourism:guest_house", "stay"],
    ["tourism:attraction", "attraction"],
    ["tourism:viewpoint", "attraction"],
    ["natural:peak", "attraction"],
  ];
  const results = await Promise.allSettled(
    searches.map(async ([tag, category]) => {
      const params = new URLSearchParams({
        lon: destination.lon,
        lat: destination.lat,
        radius: "20",
        limit: "6",
        osm_tag: tag,
        lang: "en",
      });
      const data = await fetchJson(
        `${PHOTON_URL}/reverse?${params}`,
        {},
        18000,
      );
      return (data.features || []).map((feature) => {
        const props = feature.properties || {};
        const [lon, lat] = feature.geometry.coordinates;
        const id = `${props.osm_type || "p"}-${props.osm_id || `${lat}-${lon}`}`;
        return {
          id,
          name:
            props.name ||
            {
              fuel: "Fuel station",
              food: "Local eatery",
              stay: "Budget stay",
              attraction: "Local highlight",
            }[category],
          category,
          lat,
          lon,
          type: props.osm_value || tag.split(":")[1],
          openingHours: null,
          website: null,
          phone: null,
          estimate: priceEstimate(
            category,
            { tourism: props.osm_value },
            props.osm_id,
          ),
          image: fallbackPlacePhoto(category),
          imageAlt: `${category} near ${destination.name}`,
          imageAttribution: "Rove category artwork",
          tags: props,
        };
      });
    }),
  );
  const photonPlaces = results
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter(
      (place, index, all) =>
        all.findIndex((item) => item.id === place.id) === index,
    );
  if (photonPlaces.length) {
    try {
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({ time: Date.now(), places: photonPlaces }),
      );
    } catch {
      /* Storage is optional. */
    }
    return photonPlaces;
  }

  const query = `[out:json][timeout:22];(
    nwr(around:10000,${destination.lat},${destination.lon})[tourism~"attraction|viewpoint|hotel|hostel|guest_house|camp_site"];
    nwr(around:7000,${destination.lat},${destination.lon})[amenity~"restaurant|cafe|fast_food|fuel"];
  );out center tags 50;`;
  let lastError;
  for (const endpoint of OVERPASS_URLS) {
    try {
      const data = await fetchJson(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: new URLSearchParams({ data: query }),
        },
        30000,
      );
      return (data.elements || [])
        .map((element) => {
          const tags = element.tags || {};
          const lat = element.lat ?? element.center?.lat;
          const lon = element.lon ?? element.center?.lon;
          const category = categoryFromTags(tags);
          return {
            id: `${element.type}-${element.id}`,
            name:
              tags.name ||
              tags.brand ||
              tags.operator ||
              {
                fuel: "Fuel station",
                food: "Local eatery",
                stay: "Budget stay",
                attraction: "Local highlight",
              }[category],
            category,
            lat,
            lon,
            type:
              tags.cuisine ||
              tags.tourism ||
              tags.amenity ||
              tags.natural ||
              "place",
            openingHours: tags.opening_hours,
            website: tags.website || tags["contact:website"],
            phone: tags.phone || tags["contact:phone"],
            fee: tags.fee,
            estimate: priceEstimate(category, tags, element.id),
            image: fallbackPlacePhoto(category),
            imageAlt: `${category} near ${destination.name}`,
            imageAttribution: "Rove category artwork",
            tags,
          };
        })
        .filter((place) => place.lat && place.lon)
        .filter(
          (place, index, all) =>
            all.findIndex(
              (item) =>
                item.name === place.name && item.category === place.category,
            ) === index,
        );
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) return fallbackNearbyPlaces(destination);
  return fallbackNearbyPlaces(destination);
};

export const getRouteEssentials = async (route) => {
  const coordinates = route?.geometry?.coordinates || [];
  if (!coordinates.length) return [];
  const cacheKey = `rove-corridor-${coordinates[0].join("-")}-${coordinates.at(-1).join("-")}`;
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
    if (cached?.time > Date.now() - 30 * 60 * 1000 && cached.items?.length)
      return cached.items;
  } catch {
    /* Storage is optional. */
  }
  const checkpoints = [0.18, 0.5, 0.82].map((progress) => ({
    progress,
    coordinate:
      coordinates[
        Math.min(
          coordinates.length - 1,
          Math.round((coordinates.length - 1) * progress),
        )
      ],
  }));
  const searches = [
    { tag: "amenity:fuel", category: "fuel", fallback: "Petrol pump" },
    {
      tag: "shop:motorcycle",
      category: "service",
      fallback: "Motorcycle service",
    },
    {
      tag: "amenity:hospital",
      category: "hospital",
      fallback: "Emergency hospital",
    },
  ];
  const results = await Promise.allSettled(
    checkpoints.flatMap((checkpoint) =>
      searches.map(async (search) => {
        const [lon, lat] = checkpoint.coordinate;
        const params = new URLSearchParams({
          lon,
          lat,
          radius: "10",
          limit: "3",
          osm_tag: search.tag,
          lang: "en",
        });
        const data = await fetchJson(
          `${PHOTON_URL}/reverse?${params}`,
          {},
          18000,
        );
        return (data.features || []).map((feature) => {
          const props = feature.properties || {};
          const [placeLon, placeLat] = feature.geometry.coordinates;
          return {
            id: `corridor-${props.osm_type || "p"}-${props.osm_id || `${placeLat}-${placeLon}`}`,
            name: props.name || search.fallback,
            category: search.category,
            type: props.osm_value || search.tag.split(":")[1],
            lat: placeLat,
            lon: placeLon,
            routeProgress: checkpoint.progress,
            routeKm: Math.round(route.distanceKm * checkpoint.progress),
            estimate: null,
            openingHours: null,
            image: fallbackPlacePhoto(search.category),
            imageAlt: `${search.category} along the route`,
            imageAttribution: "Rove category artwork",
            tags: props,
          };
        });
      }),
    ),
  );
  const items = results
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter(
      (place, index, all) =>
        all.findIndex((item) => item.id === place.id) === index,
    )
    .sort((a, b) => a.routeProgress - b.routeProgress);
  try {
    sessionStorage.setItem(
      cacheKey,
      JSON.stringify({ time: Date.now(), items }),
    );
  } catch {
    /* Storage is optional. */
  }
  return items;
};

export const getDepartureWindows = (route, date, weather) => {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const weekend = weekday === 0 || weekday === 6;
  const base = weekend
    ? [
        { hour: 4.5, multiplier: 0.78 },
        { hour: 5.5, multiplier: 0.82 },
        { hour: 6.5, multiplier: 0.91 },
        { hour: 7.5, multiplier: 1.02 },
        { hour: 8.5, multiplier: 1.12 },
      ]
    : [
        { hour: 4.5, multiplier: 0.76 },
        { hour: 5.5, multiplier: 0.82 },
        { hour: 6.5, multiplier: 0.98 },
        { hour: 7.5, multiplier: 1.28 },
        { hour: 8.5, multiplier: 1.38 },
      ];
  const rainPenalty =
    (weather?.rain || 0) > 60 ? 0.14 : (weather?.rain || 0) > 30 ? 0.07 : 0;
  return base
    .map(({ hour, multiplier }) => {
      const adjustedMultiplier = multiplier + rainPenalty;
      const hours = Math.floor(hour);
      const minutes = Math.round((hour - hours) * 60);
      const adjustedMinutes = Math.round(
        route.durationMinutes * adjustedMultiplier,
      );
      return {
        time: new Date(2000, 0, 1, hours, minutes).toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
        }),
        hour,
        traffic:
          adjustedMultiplier < 0.9
            ? "Low"
            : adjustedMultiplier < 1.15
              ? "Moderate"
              : "Heavy",
        multiplier: adjustedMultiplier,
        adjustedMinutes,
        delayMinutes: Math.max(0, adjustedMinutes - route.durationMinutes),
        score: Math.max(1, Math.min(10, 10 - (adjustedMultiplier - 0.72) * 13)),
      };
    })
    .sort((a, b) => b.score - a.score);
};

export const getElevation = async (coordinates) => {
  if (!coordinates?.length) return [];
  const points = sampleLine(coordinates, 70);
  const params = new URLSearchParams({
    latitude: points.map((point) => point[1]).join(","),
    longitude: points.map((point) => point[0]).join(","),
  });
  const data = await fetchJson(`${ELEVATION_URL}?${params}`, {}, 20000);
  return data.elevation || [];
};

export const calculateBudget = (route, settings) => {
  const distance = route?.distanceKm || 0;
  const tripDistance = distance * (settings.roundTrip ? 2 : 1);
  const fuel =
    (tripDistance / Math.max(1, settings.mileage)) * settings.fuelPrice;
  const stay = settings.nights * settings.stayPerNight;
  const days = Math.max(1, settings.nights + 1);
  const food = days * settings.riders * settings.foodPerDay;
  return {
    distance: tripDistance,
    fuel: Math.round(fuel),
    stay: Math.round(stay),
    food: Math.round(food),
    other: Math.round(settings.otherCosts),
    total: Math.round(fuel + stay + food + settings.otherCosts),
  };
};

export const formatDuration = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours ? `${hours}h ${mins}m` : `${mins}m`;
};

export const distanceBetween = (a, b) => {
  const rad = (value) => (value * Math.PI) / 180;
  const earth = 6371;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
