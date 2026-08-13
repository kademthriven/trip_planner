import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bike,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Compass,
  Download,
  ExternalLink,
  Fuel,
  Gauge,
  Heart,
  Hotel,
  Layers3,
  ListChecks,
  LocateFixed,
  MapPin,
  Menu,
  Minus,
  Moon,
  Navigation,
  Phone,
  Plus,
  RefreshCw,
  Route,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  Sun,
  UtensilsCrossed,
  Wallet,
  X,
  Zap,
  LogOut,
  UserRound,
  Volume2,
  VolumeX,
  Crosshair,
  Radio,
  Wrench,
  Hospital,
  Users,
  ReceiptIndianRupee,
  BookOpen,
  Camera,
  ImagePlus,
  Trash2,
  UserPlus,
  Copy,
} from "lucide-react";
import AuthScreen from "./AuthScreen";
import { clearSession, getSession, observeAuthState } from "./auth";
import { loadRiderData, saveRiderData } from "./cloudStore";
import { firebaseConfigured, firebaseModeLabel } from "./firebase";
import { generateItinerary } from "./itinerary";
import {
  DEFAULT_END,
  DEFAULT_START,
  calculateBudget,
  distanceBetween,
  formatDuration,
  enrichPlacesWithPhotos,
  geocode,
  getDepartureWindows,
  getDestinationPhoto,
  getElevation,
  getNearbyPlaces,
  getRouteEssentials,
  getRoutes,
  getWeather,
  reverseGeocode,
} from "./services";
import { deleteRidePhoto, getRidePhotos, saveRidePhoto } from "./journalStore";
import "./App.css";

const MapView = lazy(() => import("./MapView"));

const DEFAULT_SETTINGS = {
  bikeId: "adventure",
  bikeName: "Adventure motorcycle",
  mileage: 35,
  fuelPrice: 101.6,
  riders: 1,
  nights: 1,
  stayPerNight: 880,
  foodPerDay: 450,
  otherCosts: 200,
  roundTrip: true,
};

const BIKE_PRESETS = [
  {
    id: "commuter",
    name: "Commuter motorcycle",
    mileage: 55,
    description: "100–160 cc · efficient",
  },
  {
    id: "scooter",
    name: "Scooter",
    mileage: 45,
    description: "City-friendly automatic",
  },
  {
    id: "cruiser",
    name: "Cruiser motorcycle",
    mileage: 32,
    description: "Relaxed highway ride",
  },
  {
    id: "adventure",
    name: "Adventure motorcycle",
    mileage: 35,
    description: "Touring and mixed roads",
  },
  {
    id: "sport",
    name: "Sport motorcycle",
    mileage: 25,
    description: "Performance setup",
  },
  {
    id: "custom",
    name: "Custom bike",
    mileage: 35,
    description: "Enter your own mileage",
  },
];

const categoryMeta = {
  attraction: { label: "Sights", icon: Sparkles, color: "#e7fe52" },
  food: { label: "Food", icon: UtensilsCrossed, color: "#fb8d62" },
  stay: { label: "Stays", icon: Hotel, color: "#a392f2" },
  fuel: { label: "Fuel", icon: Fuel, color: "#f0a956" },
  service: { label: "Bike service", icon: Wrench, color: "#71c8f0" },
  hospital: { label: "Hospitals", icon: Hospital, color: "#ff7068" },
};

const createFallbackRoute = (
  from = DEFAULT_START,
  to = DEFAULT_END,
  rideSettings = DEFAULT_SETTINGS,
) => {
  const distanceKm = Math.max(1, distanceBetween(from, to) * 1.16);
  return {
    id: "scenic-0",
    name: "Direct ride",
    note: "Preview route",
    traffic: "Route service offline",
    color: "#e7fe52",
    distanceKm,
    durationMinutes: Math.round((distanceKm / 38) * 60),
    fuelOneWay:
      (distanceKm / Math.max(1, rideSettings.mileage)) *
      rideSettings.fuelPrice,
    road: "Direct preview",
    steps: [],
    geometry: {
      type: "LineString",
      coordinates: [
        [from.lon, from.lat],
        [to.lon, to.lat],
      ],
    },
  };
};

const fallbackRoute = createFallbackRoute();

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const formatMoney = (value) => `₹${money.format(Math.round(value || 0))}`;
const formatDate = (
  value,
  options = { weekday: "short", day: "numeric", month: "short" },
) =>
  value
    ? new Intl.DateTimeFormat("en-IN", options).format(
        new Date(`${value}T12:00:00`),
      )
    : "Choose date";
const toDateInput = (date) => date.toISOString().slice(0, 10);
const formatNavDistance = (kilometres) =>
  kilometres < 1
    ? `${Math.max(10, Math.round((kilometres * 1000) / 10) * 10)} m`
    : `${kilometres.toFixed(kilometres < 10 ? 1 : 0)} km`;

// Windows Wi-Fi positioning commonly settles just above 100 m even when the
// returned coordinates are usable for choosing a road and starting a route.
const MAX_LIVE_LOCATION_ACCURACY_METERS = 150;

const createLocationError = (code, message, accuracy) =>
  Object.assign(new Error(message), { code, accuracy });

const readAccurateBrowserPosition = () =>
  new Promise((resolve, reject) => {
    let bestPosition = null;
    let lastError = null;
    let settled = false;
    let watchId;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(deadline);
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      callback(value);
    };

    const deadline = window.setTimeout(() => {
      if (bestPosition) {
        finish(
          reject,
          createLocationError(
            2,
            `Location accuracy is only ±${Math.round(bestPosition.coords.accuracy)} m.`,
            bestPosition.coords.accuracy,
          ),
        );
        return;
      }
      finish(
        reject,
        lastError || createLocationError(3, "The GPS request timed out."),
      );
    }, 20000);

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (
          !bestPosition ||
          position.coords.accuracy < bestPosition.coords.accuracy
        ) {
          bestPosition = position;
        }
        if (
          Number.isFinite(position.coords.accuracy) &&
          position.coords.accuracy <= MAX_LIVE_LOCATION_ACCURACY_METERS
        ) {
          finish(resolve, position);
        }
      },
      (error) => {
        lastError = error;
        if (error?.code === 1) finish(reject, error);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });

const readGeolocationPermission = async () => {
  try {
    return (
      await navigator.permissions?.query({ name: "geolocation" })
    )?.state;
  } catch {
    return "unknown";
  }
};

const requestLiveOrigin = async () => {
  if (!window.isSecureContext)
    throw new Error("Precise location needs HTTPS or a localhost address.");
  if (!navigator.geolocation) throw new Error("Geolocation is unavailable.");

  const rawPosition = await readAccurateBrowserPosition();

  const lat = rawPosition.coords.latitude;
  const lon = rawPosition.coords.longitude;
  const place = await reverseGeocode(lat, lon).catch(() => ({
    name: "Current location",
    subtitle: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    lat,
    lon,
  }));
  return {
    place,
    position: {
      lat,
      lon,
      accuracy: rawPosition.coords.accuracy,
      heading: rawPosition.coords.heading,
      speed: rawPosition.coords.speed,
      source: "device",
    },
  };
};

let startupLocationPromise;
const requestStartupOrigin = () => {
  if (!startupLocationPromise) {
    startupLocationPromise = requestLiveOrigin().catch((error) => {
      startupLocationPromise = null;
      throw error;
    });
  }
  return startupLocationPromise;
};

const diagnoseLocationError = async (error) => {
  if (!window.isSecureContext) {
    return {
      title: "Secure connection required",
      detail: "Precise GPS requires HTTPS or localhost.",
    };
  }

  const permissionsPolicy =
    document.permissionsPolicy || document.featurePolicy;
  if (
    permissionsPolicy?.allowsFeature &&
    !permissionsPolicy.allowsFeature("geolocation")
  ) {
    return {
      title: "Location blocked by app preview",
      detail:
        "Open the app directly in a browser tab. The current embedded preview does not allow geolocation.",
    };
  }

  const permissionState = await readGeolocationPermission();

  if (Number.isFinite(error?.accuracy)) {
    return {
      title: "Waiting for accurate GPS",
      detail: `The available fix is only accurate to ±${Math.round(error.accuracy)} m. A fix within ±${MAX_LIVE_LOCATION_ACCURACY_METERS} m is required before it can be used.`,
    };
  }
  if (error?.code === 1 && permissionState === "granted") {
    return {
      title: "Precise position unavailable",
      detail:
        "Location is allowed, but this device did not provide coordinates. Use a GPS-capable phone or GPS receiver and retry.",
    };
  }
  if (error?.code === 1) {
    return {
      title: "Location permission blocked",
      detail:
        permissionState === "prompt"
          ? "Location permission has not been granted yet. Choose Allow when your browser asks."
          : "Location permission is blocked for this site in your browser.",
    };
  }
  if (error?.code === 2) {
    return {
      title: "GPS signal unavailable",
      detail: "Your device could not determine its position. Move near a window and retry.",
    };
  }
  if (error?.code === 3) {
    return {
      title: "GPS request timed out",
      detail: "The GPS request timed out. Check device Location services and retry.",
    };
  }
  return {
    title: "Precise GPS unavailable",
    detail: error?.message || "Precise location is unavailable.",
  };
};

const navigationGpsIssue = async (error) => {
  if (error?.code === 1) {
    const permissionState = await readGeolocationPermission();
    return {
      status: permissionState === "granted" ? "unavailable" : "denied",
      message:
        permissionState === "granted"
          ? "Location is allowed, but this device supplied no coordinates."
          : "Location permission is blocked. Allow it in your browser's site settings, then restart navigation.",
    };
  }
  if (error?.code === 2) {
    return {
      status: "unavailable",
      message:
        "A GPS signal is temporarily unavailable. Navigation will keep trying.",
    };
  }
  if (error?.code === 3) {
    return {
      status: "timeout",
      message: "GPS is taking longer than expected. Navigation will keep trying.",
    };
  }
  return {
    status: "unavailable",
    message: "Live location is temporarily unavailable. Navigation will keep trying.",
  };
};

function WeatherGlyph({ type, size = 18 }) {
  if (type === "sun") return <Sun size={size} />;
  if (type === "rain") return <CloudRain size={size} />;
  if (type === "fog") return <CloudFog size={size} />;
  if (type === "storm") return <CloudLightning size={size} />;
  if (type === "snow") return <Moon size={size} />;
  return <CloudSun size={size} />;
}

function LocationSearch({
  label,
  value,
  onChange,
  onFocus,
  suggestions,
  active,
  onSelect,
  icon,
  onLocate,
}) {
  return (
    <label className="location-search-field">
      <span>{label}</span>
      <div>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          aria-label={label}
        />
        <button
          type="button"
          onClick={onLocate}
          aria-label={onLocate ? "Use current location" : "Search destination"}
        >
          {icon}
        </button>
      </div>
      {active && suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((place) => (
            <button
              type="button"
              key={`${place.lat}-${place.lon}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(place)}
            >
              <MapPin size={14} />
              <span>
                <strong>{place.name}</strong>
                <small>{place.subtitle}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

function LoadingLine({ children }) {
  return (
    <div className="loading-line">
      <span />
      {children}
    </div>
  );
}

function PlacePhoto({ place, Icon, className = "" }) {
  return (
    <span className={`place-image ${place.category} has-photo ${className}`}>
      {place.image && (
        <img
          src={place.image}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
      <Icon size={16} />
      {[
        "wikimedia-geosearch",
        "wikimedia-name-search",
        "wikimedia-area",
        "osm-tagged-image",
      ].includes(place.imageSource) && (
        <small className="real-photo-badge">
          {place.imageDistanceKm == null
            ? "REAL"
            : place.imageDistanceKm < 1
              ? `${Math.round(place.imageDistanceKm * 1000)} m`
              : `${place.imageDistanceKm.toFixed(1)} km`}
        </small>
      )}
    </span>
  );
}

function TripPlanner({ user, onLogout }) {
  const mapRef = useRef(null);
  const wakeLockRef = useRef(null);
  const lastSpokenRef = useRef("");
  const lastRerouteRef = useRef(0);
  const rideStartedRef = useRef(null);
  const placeLoadRef = useRef(0);
  const searchAbortRef = useRef(null);
  const lastGpsIssueRef = useRef(null);
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);
  const [startText, setStartText] = useState(() =>
    navigator.geolocation ? "Finding current location…" : DEFAULT_START.name,
  );
  const [endText, setEndText] = useState(DEFAULT_END.name);
  const [activeSearch, setActiveSearch] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [routes, setRoutes] = useState([fallbackRoute]);
  const [selectedId, setSelectedId] = useState(fallbackRoute.id);
  const [weather, setWeather] = useState([]);
  const [places, setPlaces] = useState([]);
  const [destinationPhoto, setDestinationPhoto] = useState(null);
  const [routeEssentials, setRouteEssentials] = useState([]);
  const [essentialsLoading, setEssentialsLoading] = useState(true);
  const [elevation, setElevation] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [draftSettings, setDraftSettings] = useState(DEFAULT_SETTINGS);
  const [departureDate, setDepartureDate] = useState(toDateInput(new Date()));
  const [departureTime, setDepartureTime] = useState("5:30 AM");
  const [unit, setUnit] = useState("km");
  const [panelMode, setPanelMode] = useState("plan");
  const [placeFilter, setPlaceFilter] = useState("all");
  const [visibleCategories, setVisibleCategories] = useState(
    new Set(Object.keys(categoryMeta)),
  );
  const [layersOpen, setLayersOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [placesLoading, setPlacesLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [routeDetailsOpen, setRouteDetailsOpen] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [itinerarySeed, setItinerarySeed] = useState(0);
  const [riding, setRiding] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [originStatus, setOriginStatus] = useState({
    kind: "locating",
    title: "Finding your live location",
    detail: "Waiting for precise GPS permission…",
  });
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [followNavigation, setFollowNavigation] = useState(true);
  const [rerouting, setRerouting] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("preview");
  const [navigationClock, setNavigationClock] = useState(() => Date.now());
  const [savedTrips, setSavedTrips] = useState([]);
  const [groupMembers, setGroupMembers] = useState([
    {
      id: user.id,
      name: user.name,
      contact: user.email,
      bike: DEFAULT_SETTINGS.bikeName,
      organizer: true,
    },
  ]);
  const [expenses, setExpenses] = useState([]);
  const [history, setHistory] = useState([]);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudSync, setCloudSync] = useState("loading");
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [journalDraft, setJournalDraft] = useState("");
  const [journalRating, setJournalRating] = useState(0);
  const [ridePhotos, setRidePhotos] = useState([]);
  const [memberDraft, setMemberDraft] = useState({
    name: "",
    contact: "",
    bike: "",
  });
  const [expenseDraft, setExpenseDraft] = useState({
    description: "",
    amount: "",
    paidBy: user.id,
  });

  const activeRoute = useMemo(
    () =>
      routes.find((route) => route.id === selectedId) ||
      routes[0] ||
      fallbackRoute,
    [routes, selectedId],
  );
  const budget = useMemo(
    () => calculateBudget(activeRoute, settings),
    [activeRoute, settings],
  );
  const bestWeather = weather[0];
  const chronologicalWeather = useMemo(
    () => [...weather].sort((a, b) => a.date.localeCompare(b.date)),
    [weather],
  );
  const chosenWeather =
    weather.find((day) => day.date === departureDate) || bestWeather;
  const returnDate = useMemo(() => {
    if (!departureDate) return "";
    const value = new Date(`${departureDate}T12:00:00`);
    value.setDate(
      value.getDate() + settings.nights + (settings.roundTrip ? 1 : 0),
    );
    return toDateInput(value);
  }, [departureDate, settings.nights, settings.roundTrip]);
  const elevationGain = useMemo(
    () =>
      elevation.reduce(
        (sum, value, index) =>
          sum + Math.max(0, value - (elevation[index - 1] ?? value)),
        0,
      ),
    [elevation],
  );
  const navigationState = useMemo(() => {
    const position = currentPosition || start;
    const coordinates = activeRoute.geometry?.coordinates || [];
    if (!coordinates.length)
      return {
        progress: 0,
        remainingKm: activeRoute.distanceKm,
        remainingMinutes: activeRoute.durationMinutes,
        distanceToRoute: 0,
        nextStep: activeRoute.steps?.[0],
      };
    let nearestIndex = 0;
    let distanceToRoute = Infinity;
    coordinates.forEach((coordinate, index) => {
      const distance = distanceBetween(position, {
        lat: coordinate[1],
        lon: coordinate[0],
      });
      if (distance < distanceToRoute) {
        distanceToRoute = distance;
        nearestIndex = index;
      }
    });
    const progress = Math.max(
      0,
      Math.min(100, (nearestIndex / Math.max(1, coordinates.length - 1)) * 100),
    );
    const stepsWithIndex = (activeRoute.steps || [])
      .filter((step) => step.location)
      .map((step) => {
        let routeIndex = 0;
        let closest = Infinity;
        coordinates.forEach((coordinate, index) => {
          const distance = distanceBetween(
            { lat: step.location[1], lon: step.location[0] },
            { lat: coordinate[1], lon: coordinate[0] },
          );
          if (distance < closest) {
            closest = distance;
            routeIndex = index;
          }
        });
        return { ...step, routeIndex };
      });
    const nextStep =
      stepsWithIndex.find((step) => step.routeIndex > nearestIndex + 1) ||
      stepsWithIndex.at(-1);
    const distanceToTurn = nextStep?.location
      ? distanceBetween(position, {
          lat: nextStep.location[1],
          lon: nextStep.location[0],
        })
      : activeRoute.distanceKm * (1 - progress / 100);
    return {
      progress,
      nearestIndex,
      distanceToRoute,
      remainingKm: activeRoute.distanceKm * (1 - progress / 100),
      remainingMinutes: Math.max(
        0,
        activeRoute.durationMinutes * (1 - progress / 100),
      ),
      distanceToTurn,
      nextStep,
    };
  }, [currentPosition, start, activeRoute]);
  const rideProgress = Math.round(navigationState.progress);
  const arrivalTime = useMemo(
    () =>
      new Date(
        navigationClock + navigationState.remainingMinutes * 60000,
      ).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
    [navigationClock, navigationState.remainingMinutes],
  );
  const filteredPlaces = useMemo(
    () =>
      places.filter(
        (place) => placeFilter === "all" || place.category === placeFilter,
      ),
    [places, placeFilter],
  );
  const isSaved = savedTrips.some(
    (trip) => trip.start?.name === start.name && trip.end?.name === end.name,
  );
  const generatedItinerary = useMemo(
    () =>
      generateItinerary({
        start,
        end,
        route: activeRoute,
        weather: chosenWeather,
        places,
        settings,
        departureDate,
        returnDate,
        departureTime,
        variation: itinerarySeed,
      }),
    [
      start,
      end,
      activeRoute,
      chosenWeather,
      places,
      settings,
      departureDate,
      returnDate,
      departureTime,
      itinerarySeed,
    ],
  );
  const departureWindows = useMemo(
    () => getDepartureWindows(activeRoute, departureDate, chosenWeather),
    [activeRoute, departureDate, chosenWeather],
  );
  const mapPlaces = useMemo(
    () => [...places, ...routeEssentials],
    [places, routeEssentials],
  );
  const selectedHistory = history.find((ride) => ride.id === selectedHistoryId);
  const actualExpenseTotal = expenses.reduce(
    (total, expense) => total + Number(expense.amount || 0),
    0,
  );
  const splitTotal = actualExpenseTotal || budget.total;
  const splitPerRider = splitTotal / Math.max(1, groupMembers.length);
  const riderBalances = groupMembers
    .map((member) => ({
      ...member,
      paid: expenses
        .filter((expense) => expense.paidBy === member.id)
        .reduce((total, expense) => total + Number(expense.amount || 0), 0),
    }))
    .map((member) => ({ ...member, balance: member.paid - splitPerRider }));

  const toast = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }, []);

  const loadTrip = useCallback(
    async (from = start, to = end, rideSettings = settings) => {
      setLoading(true);
      setPlacesLoading(true);
      setError("");
      setActiveSearch(null);
      const requestId = ++placeLoadRef.current;
      const placePromise = getNearbyPlaces(to);
      getDestinationPhoto(to)
        .then((photo) => {
          if (requestId === placeLoadRef.current) setDestinationPhoto(photo);
        })
        .catch(() => {
          if (requestId === placeLoadRef.current) setDestinationPhoto(null);
        });
      getWeather(to)
        .then((weatherResult) => {
          if (requestId !== placeLoadRef.current) return;
          setWeather(weatherResult);
          if (weatherResult[0]?.date) setDepartureDate(weatherResult[0].date);
        })
        .catch(() => {
          if (requestId === placeLoadRef.current) setWeather([]);
        });
      try {
        let loadedRoutes = [fallbackRoute];
        try {
          loadedRoutes = await getRoutes(from, to, rideSettings);
          if (requestId !== placeLoadRef.current) return;
          setRoutes(loadedRoutes);
          setSelectedId(loadedRoutes[0].id);
        } catch {
          if (requestId !== placeLoadRef.current) return;
          const previewRoute = createFallbackRoute(from, to, rideSettings);
          loadedRoutes = [previewRoute];
          setRoutes([previewRoute]);
          setSelectedId(previewRoute.id);
          setError(
            "Live routing is temporarily unavailable. Showing a preview line; try again shortly.",
          );
        }
        setEssentialsLoading(true);
        getRouteEssentials(loadedRoutes[0])
          .then((items) => {
            if (requestId === placeLoadRef.current) setRouteEssentials(items);
          })
          .catch(() => {
            if (requestId === placeLoadRef.current) setRouteEssentials([]);
          })
          .finally(() => {
            if (requestId === placeLoadRef.current) setEssentialsLoading(false);
          });
        getElevation(loadedRoutes[0].geometry.coordinates)
          .then((values) => {
            if (requestId === placeLoadRef.current) setElevation(values);
          })
          .catch(() => {
            if (requestId === placeLoadRef.current) setElevation([]);
          });
      } finally {
        if (requestId === placeLoadRef.current) setLoading(false);
      }
      placePromise
        .then((items) => {
          if (requestId !== placeLoadRef.current) return;
          setPlaces(items);
          setPlacesLoading(false);
          enrichPlacesWithPhotos(items, to).then((enriched) => {
            if (requestId !== placeLoadRef.current) return;
            setPlaces((current) =>
              enriched.map((place) => ({
                ...place,
                planned:
                  current.find((item) => item.id === place.id)?.planned ||
                  false,
              })),
            );
          });
        })
        .catch(() => {
          if (requestId === placeLoadRef.current) {
            setPlaces([]);
            setPlacesLoading(false);
          }
        });
    },
    [start, end, settings],
  );

  useEffect(() => {
    let active = true;
    const initializeFromCurrentLocation = async () => {
      let origin;
      try {
        const liveOrigin = await requestStartupOrigin();
        if (!active) return;
        origin = liveOrigin.place;
        setStart(liveOrigin.place);
        setStartText(liveOrigin.place.name);
        setCurrentPosition(liveOrigin.position);
        setOriginStatus({
          kind: "precise",
          title: "Live GPS location",
          detail: `${liveOrigin.position.lat.toFixed(5)}, ${liveOrigin.position.lon.toFixed(5)} · ±${Math.round(liveOrigin.position.accuracy || 0)} m`,
        });
        toast("Using your live location as the starting point.");
      } catch (gpsError) {
        if (!active) return;
        const gpsIssue = await diagnoseLocationError(gpsError);
        if (!active) return;
        origin = DEFAULT_START;
        setStart(DEFAULT_START);
        setStartText(DEFAULT_START.name);
        setCurrentPosition(null);
        setOriginStatus({
          kind: "error",
          title: gpsIssue.title,
          detail: `${gpsIssue.detail} Select your start manually or retry GPS.`,
        });
        toast("An accurate device location was not available. Select the start manually or retry GPS.");
      }
      if (active) loadTrip(origin, DEFAULT_END);
    };
    initializeFromCurrentLocation();
    return () => {
      active = false;
    };
    // Initial location and trip load only; subsequent loads are user initiated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeSearch) {
      searchAbortRef.current?.abort();
      return undefined;
    }
    const query = activeSearch === "start" ? startText : endText;
    if (query.trim().length < 2) {
      searchAbortRef.current?.abort();
      const resetTimer = window.setTimeout(() => {
        setSuggestions([]);
        setSearching(false);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }
    let controller;
    const timer = window.setTimeout(async () => {
      searchAbortRef.current?.abort();
      controller = new AbortController();
      searchAbortRef.current = controller;
      setSearching(true);
      try {
        setSuggestions(
          await geocode(query, activeSearch === "end" ? start : undefined, {
            signal: controller.signal,
          }),
        );
      } catch (searchError) {
        if (searchError.name !== "AbortError") setSuggestions([]);
      } finally {
        if (searchAbortRef.current === controller) setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [activeSearch, startText, endText, start]);

  useEffect(() => {
    if (!riding) return undefined;
    if (!window.isSecureContext) {
      if (lastGpsIssueRef.current !== "insecure") {
        lastGpsIssueRef.current = "insecure";
        toast("Live GPS requires HTTPS or localhost.");
      }
      return undefined;
    }
    if (!navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (
          !Number.isFinite(position.coords.accuracy) ||
          position.coords.accuracy > MAX_LIVE_LOCATION_ACCURACY_METERS
        ) {
          setGpsStatus("weak");
          if (lastGpsIssueRef.current !== "weak") {
            lastGpsIssueRef.current = "weak";
            toast(
              `Waiting for accurate GPS (currently ±${Math.round(position.coords.accuracy || 0)} m).`,
            );
          }
          return;
        }
        lastGpsIssueRef.current = null;
        setGpsStatus("live");
        setCurrentPosition({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
          accuracy: position.coords.accuracy,
          source: "device",
        });
      },
      async (error) => {
        const issue = await navigationGpsIssue(error);
        setGpsStatus(issue.status);
        if (lastGpsIssueRef.current !== issue.status) {
          lastGpsIssueRef.current = issue.status;
          toast(issue.message);
        }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [riding, toast]);

  useEffect(() => {
    if (!riding) return undefined;
    const interval = window.setInterval(
      () => setNavigationClock(Date.now()),
      30000,
    );
    return () => window.clearInterval(interval);
  }, [riding]);

  useEffect(() => {
    if (riding && followNavigation && currentPosition)
      mapRef.current?.followPosition(currentPosition);
  }, [riding, followNavigation, currentPosition]);

  useEffect(() => {
    if (!riding || !navigator.wakeLock) return undefined;
    let active = true;
    const requestWakeLock = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        /* Device may deny wake lock in battery saver. */
      }
    };
    requestWakeLock();
    const handleVisibility = () => {
      if (
        active &&
        document.visibilityState === "visible" &&
        wakeLockRef.current?.released
      )
        requestWakeLock();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [riding]);

  useEffect(() => {
    const instruction = navigationState.nextStep?.instruction;
    if (
      !riding ||
      !voiceEnabled ||
      !instruction ||
      !window.speechSynthesis ||
      lastSpokenRef.current === instruction
    )
      return;
    lastSpokenRef.current = instruction;
    window.speechSynthesis.cancel();
    const prompt = new SpeechSynthesisUtterance(
      `${navigationState.distanceToTurn < 0.12 ? "Now" : `In ${formatNavDistance(navigationState.distanceToTurn)}`}, ${instruction}`,
    );
    prompt.rate = 1;
    prompt.pitch = 1;
    window.speechSynthesis.speak(prompt);
  }, [
    riding,
    voiceEnabled,
    navigationState.nextStep,
    navigationState.distanceToTurn,
  ]);

  useEffect(() => {
    if (
      !riding ||
      gpsStatus !== "live" ||
      !currentPosition ||
      navigationState.distanceToRoute < 0.45 ||
      rerouting ||
      Date.now() - lastRerouteRef.current < 25000
    )
      return undefined;
    let cancelled = false;
    lastRerouteRef.current = Date.now();
    setRerouting(true);
    getRoutes(currentPosition, end, settings)
      .then((freshRoutes) => {
        if (cancelled || !freshRoutes.length) return;
        setRoutes(freshRoutes);
        setSelectedId(freshRoutes[0].id);
        toast("Route updated from your live position.");
      })
      .catch(() =>
        toast("Could not reroute yet. Stay on a safe road and retry."),
      )
      .finally(() => {
        if (!cancelled) setRerouting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    riding,
    gpsStatus,
    currentPosition,
    navigationState.distanceToRoute,
    rerouting,
    end,
    settings,
    toast,
  ]);

  useEffect(() => {
    let active = true;
    loadRiderData(user)
      .then((data) => {
        if (!active) return;
        setSavedTrips(data.savedTrips || []);
        setGroupMembers(
          data.groupMembers?.length
            ? data.groupMembers
            : [
                {
                  id: user.id,
                  name: user.name,
                  contact: user.email,
                  bike: DEFAULT_SETTINGS.bikeName,
                  organizer: true,
                },
              ],
        );
        setExpenses(data.expenses || []);
        setHistory(data.history || []);
        if (data.settings) {
          setSettings(data.settings);
          setDraftSettings(data.settings);
        }
        setCloudReady(true);
        setCloudSync("synced");
      })
      .catch(() => {
        if (active) {
          setCloudReady(true);
          setCloudSync("error");
          toast("Cloud data could not be loaded.");
        }
      });
    return () => {
      active = false;
    };
  }, [user, toast]);

  useEffect(() => {
    if (!cloudReady) return undefined;
    const timer = window.setTimeout(() => {
      setCloudSync("syncing");
      saveRiderData(user, {
        savedTrips,
        groupMembers,
        expenses,
        history,
        settings,
      })
        .then(() => setCloudSync("synced"))
        .catch(() => {
          setCloudSync("error");
          toast("Cloud sync paused. Your latest change will retry next time.");
        });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [
    cloudReady,
    user,
    savedTrips,
    groupMembers,
    expenses,
    history,
    settings,
    toast,
  ]);

  const chooseLocation = (type, place) => {
    if (type === "start") {
      setStart(place);
      setStartText(place.name);
      setCurrentPosition(null);
      setOriginStatus({
        kind: "manual",
        title: "Manually selected start",
        detail: place.subtitle || "Tap Retry GPS to use your live position.",
      });
    } else {
      setEnd(place);
      setEndText(place.name);
    }
    setActiveSearch(null);
    setSuggestions([]);
  };

  const useCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setOriginStatus({
        kind: "error",
        title: "Location is not supported",
        detail: "This browser does not provide device location.",
      });
      toast("Geolocation is not supported by this browser.");
      return;
    }
    setStartText("Finding current location…");
    setOriginStatus({
      kind: "locating",
      title: "Finding your live location",
      detail: "Waiting for precise GPS permission…",
    });
    toast("Finding your precise location…");
    try {
      const liveOrigin = await requestLiveOrigin();
      setStart(liveOrigin.place);
      setStartText(liveOrigin.place.name);
      setCurrentPosition(liveOrigin.position);
      setOriginStatus({
        kind: "precise",
        title: "Live GPS location",
        detail: `${liveOrigin.position.lat.toFixed(5)}, ${liveOrigin.position.lon.toFixed(5)} · ±${Math.round(liveOrigin.position.accuracy || 0)} m`,
      });
      toast("Starting point updated from your live location.");
      loadTrip(liveOrigin.place, end);
    } catch (locationError) {
      setStartText(start.name);
      const issue = await diagnoseLocationError(locationError);
      setOriginStatus({
        kind: "error",
        title: issue.title,
        detail: issue.detail,
      });
      toast(issue.detail);
    }
  };

  const selectRoute = useCallback(
    async (id) => {
      setSelectedId(id);
      const route = routes.find((item) => item.id === id);
      if (route) {
        try {
          setElevation(await getElevation(route.geometry.coordinates));
        } catch {
          setElevation([]);
        }
        setEssentialsLoading(true);
        getRouteEssentials(route)
          .then(setRouteEssentials)
          .catch(() => setRouteEssentials([]))
          .finally(() => setEssentialsLoading(false));
      }
    },
    [routes],
  );

  const toggleSaved = () => {
    if (isSaved) {
      setSavedTrips((trips) =>
        trips.filter(
          (trip) =>
            !(trip.start.name === start.name && trip.end.name === end.name),
        ),
      );
      toast("Trip removed from saved rides.");
    } else {
      const trip = {
        id: crypto.randomUUID?.() || String(Date.now()),
        savedAt: new Date().toISOString(),
        start,
        end,
        settings,
        departureDate,
        departureTime,
        groupMembers,
        expenses,
      };
      setSavedTrips((trips) => [trip, ...trips].slice(0, 12));
      toast(
        firebaseConfigured
          ? "Trip saved to Firebase."
          : "Trip saved in local demo mode.",
      );
    }
  };

  const loadSavedTrip = (trip) => {
    setStart(trip.start);
    setStartText(trip.start.name);
    setEnd(trip.end);
    setEndText(trip.end.name);
    setSettings(trip.settings || DEFAULT_SETTINGS);
    setDraftSettings(trip.settings || DEFAULT_SETTINGS);
    setDepartureDate(trip.departureDate || toDateInput(new Date()));
    setDepartureTime(trip.departureTime || "5:30 AM");
    if (trip.groupMembers?.length) setGroupMembers(trip.groupMembers);
    if (trip.expenses) setExpenses(trip.expenses);
    setPanelMode("plan");
    setMobilePanel(true);
    window.setTimeout(
      () => loadTrip(trip.start, trip.end, trip.settings || DEFAULT_SETTINGS),
      0,
    );
  };

  const shareTrip = async () => {
    const text = `Rove group ride: ${start.name} → ${end.name} · ${formatDate(departureDate)} at ${departureTime} · ${activeRoute.distanceKm.toFixed(0)} km · ${formatDuration(activeRoute.durationMinutes)} · ${groupMembers.length} rider${groupMembers.length > 1 ? "s" : ""} · est. ${formatMoney(budget.total)}`;
    try {
      if (navigator.share)
        await navigator.share({
          title: "My Rove trip",
          text,
          url: window.location.href,
        });
      else {
        await navigator.clipboard.writeText(text);
        toast("Trip summary copied to clipboard.");
      }
    } catch (shareError) {
      if (shareError.name !== "AbortError") toast("Could not share this trip.");
    }
  };

  const exportTrip = () => {
    const itinerary = {
      generatedBy: "Rove",
      owner: { name: user.name, email: user.email },
      start,
      destination: end,
      departureDate,
      departureTime,
      returnDate,
      groupMembers,
      expenseSplit: { total: splitTotal, perRider: splitPerRider, expenses },
      route: {
        name: activeRoute.name,
        distanceKm: activeRoute.distanceKm,
        durationMinutes: activeRoute.durationMinutes,
        road: activeRoute.road,
        provider: activeRoute.provider,
        steps: activeRoute.steps,
      },
      budget,
      settings,
      recommendedWeather: chosenWeather,
      smartItinerary: generatedItinerary,
      routeEssentials,
      plannedStops: places.filter((place) => place.planned),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(itinerary, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rove-${start.name}-${end.name}.json`
      .replaceAll(" ", "-")
      .toLowerCase();
    anchor.click();
    URL.revokeObjectURL(url);
    toast("Itinerary downloaded.");
  };

  const addPlaceToTrip = (place) => {
    setPlaces((items) =>
      items.map((item) =>
        item.id === place.id ? { ...item, planned: !item.planned } : item,
      ),
    );
    setSelectedPlace((current) =>
      current?.id === place.id
        ? { ...current, planned: !current.planned }
        : current,
    );
    toast(
      place.planned
        ? "Stop removed from itinerary."
        : `${place.name} added to your ride.`,
    );
  };

  const addGroupMember = () => {
    if (!memberDraft.name.trim()) {
      toast("Enter the rider’s name.");
      return;
    }
    const member = {
      id: crypto.randomUUID?.() || `rider-${Date.now()}`,
      name: memberDraft.name.trim(),
      contact: memberDraft.contact.trim(),
      bike: memberDraft.bike.trim() || "Motorcycle",
      organizer: false,
    };
    setGroupMembers((members) => [...members, member]);
    setSettings((value) => ({ ...value, riders: groupMembers.length + 1 }));
    setDraftSettings((value) => ({
      ...value,
      riders: groupMembers.length + 1,
    }));
    setMemberDraft({ name: "", contact: "", bike: "" });
    toast(`${member.name} added to the ride.`);
  };

  const removeGroupMember = (memberId) => {
    setGroupMembers((members) =>
      members.filter((member) => member.id !== memberId),
    );
    setExpenses((items) =>
      items.filter((expense) => expense.paidBy !== memberId),
    );
    const riderCount = Math.max(1, groupMembers.length - 1);
    setSettings((value) => ({ ...value, riders: riderCount }));
    setDraftSettings((value) => ({ ...value, riders: riderCount }));
  };

  const shareGroupInvite = async () => {
    const message = `Join my Rove ride from ${start.name} to ${end.name} on ${formatDate(departureDate)} at ${departureTime}. Distance: ${activeRoute.distanceKm.toFixed(0)} km. Estimated share: ${formatMoney(splitPerRider)}.`;
    try {
      if (navigator.share)
        await navigator.share({
          title: `Ride to ${end.name}`,
          text: message,
          url: window.location.href,
        });
      else {
        await navigator.clipboard.writeText(message);
        toast("Group invitation copied.");
      }
    } catch (shareError) {
      if (shareError.name !== "AbortError")
        toast("Could not share the invitation.");
    }
  };

  const addExpense = () => {
    const amount = Number(expenseDraft.amount);
    if (!expenseDraft.description.trim() || !amount) {
      toast("Enter an expense and amount.");
      return;
    }
    setExpenses((items) => [
      ...items,
      {
        id: crypto.randomUUID?.() || `expense-${Date.now()}`,
        description: expenseDraft.description.trim(),
        amount,
        paidBy: expenseDraft.paidBy,
        createdAt: new Date().toISOString(),
      },
    ]);
    setExpenseDraft({ description: "", amount: "", paidBy: user.id });
  };

  const openHistoryRide = async (ride) => {
    setSelectedHistoryId(ride.id);
    setJournalDraft(ride.journal || "");
    setJournalRating(ride.rating || 0);
    try {
      setRidePhotos(await getRidePhotos(ride.id, user.id));
    } catch {
      setRidePhotos([]);
    }
  };

  const saveJournal = () => {
    setHistory((rides) =>
      rides.map((ride) =>
        ride.id === selectedHistoryId
          ? {
              ...ride,
              journal: journalDraft,
              rating: journalRating,
              updatedAt: new Date().toISOString(),
            }
          : ride,
      ),
    );
    toast("Ride journal saved.");
  };

  const uploadRidePhotos = async (event) => {
    const files = [...event.target.files];
    if (!selectedHistoryId || !files.length) return;
    try {
      const uploaded = [];
      for (const file of files)
        uploaded.push(
          await saveRidePhoto({
            historyId: selectedHistoryId,
            userId: user.id,
            file,
          }),
        );
      setRidePhotos((photos) => [...uploaded, ...photos]);
      toast(
        `${uploaded.length} photo${uploaded.length > 1 ? "s" : ""} added to the journal.`,
      );
    } catch (photoError) {
      toast(photoError.message);
    }
    event.target.value = "";
  };

  const applyStayPrice = (place) => {
    setSettings((value) => ({
      ...value,
      stayPerNight: place.estimate || value.stayPerNight,
    }));
    setDraftSettings((value) => ({
      ...value,
      stayPerNight: place.estimate || value.stayPerNight,
    }));
    addPlaceToTrip(place);
  };

  const startNavigation = () => {
    setRouteDetailsOpen(false);
    setMobilePanel(false);
    setFollowNavigation(true);
    lastGpsIssueRef.current = null;
    setGpsStatus(
      !window.isSecureContext
        ? "insecure"
        : navigator.geolocation
          ? "requesting"
          : "unsupported",
    );
    setNavigationClock(Date.now());
    lastSpokenRef.current = "";
    rideStartedRef.current = new Date().toISOString();
    setRiding(true);
    window.setTimeout(
      () => mapRef.current?.followPosition(currentPosition || start),
      150,
    );
    toast(
      window.isSecureContext
        ? "In-app navigation started. Allow precise location for live guidance."
        : "Navigation preview started. Live GPS requires HTTPS or localhost.",
    );
  };

  const stopNavigation = () => {
    const completedRide = {
      id: crypto.randomUUID?.() || `ride-${Date.now()}`,
      startedAt: rideStartedRef.current || new Date().toISOString(),
      endedAt: new Date().toISOString(),
      start,
      end,
      departureTime,
      routeName: activeRoute.name,
      distanceKm: activeRoute.distanceKm,
      durationMinutes: activeRoute.durationMinutes,
      budget,
      settings,
      groupSize: groupMembers.length,
      expenses: [...expenses],
      journal: "",
      rating: 0,
    };
    setHistory((rides) => [completedRide, ...rides].slice(0, 50));
    rideStartedRef.current = null;
    setRiding(false);
    setFollowNavigation(false);
    setGpsStatus("preview");
    window.speechSynthesis?.cancel();
    mapRef.current?.recenter();
    toast("Navigation ended. Your trip remains saved.");
  };

  const planContent = (
    <>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">
            <Sparkles size={13} /> Live trip intelligence
          </p>
          <h1>Plan your escape.</h1>
        </div>
        <div className="heading-actions">
          <button
            className="save-button"
            onClick={shareTrip}
            aria-label="Share trip"
          >
            <Share2 size={17} />
          </button>
          <button
            className={`save-button ${isSaved ? "saved" : ""}`}
            onClick={toggleSaved}
            aria-label="Save route"
          >
            <Heart size={18} fill={isSaved ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
      <div className="mobile-section-nav">
        <button onClick={() => setPanelMode("group")}>
          <Users size={13} /> Group
        </button>
        <button
          onClick={() => {
            setPanelMode("history");
            setSelectedHistoryId(null);
          }}
        >
          <BookOpen size={13} /> History
        </button>
        <button onClick={() => setPanelMode("saved")}>
          <Heart size={13} /> Saved
        </button>
      </div>

      <div className={`cloud-sync-bar ${cloudSync}`}>
        <span>
          <i />
          {firebaseModeLabel}
        </span>
        <small>
          {cloudSync === "syncing"
            ? "Saving…"
            : cloudSync === "loading"
              ? "Loading your rides…"
              : cloudSync === "error"
                ? "Sync needs attention"
                : "Up to date"}
        </small>
      </div>

      <div className={`origin-status ${originStatus.kind}`} role="status">
        <span className="origin-status-icon">
          {originStatus.kind === "locating" ? (
            <RefreshCw size={13} />
          ) : originStatus.kind === "error" ? (
            <AlertTriangle size={13} />
          ) : (
            <Crosshair size={13} />
          )}
        </span>
        <span className="origin-status-copy">
          <strong>{originStatus.title}</strong>
          <small>{originStatus.detail}</small>
        </span>
        {originStatus.kind !== "locating" &&
          originStatus.kind !== "precise" && (
            <button type="button" onClick={useCurrentLocation}>
              Retry GPS
            </button>
          )}
      </div>

      <div className="location-fields">
        <span className="route-rail">
          <i />
          <b />
          <i />
        </span>
        <LocationSearch
          label="STARTING FROM"
          value={startText}
          onChange={setStartText}
          onFocus={() => setActiveSearch("start")}
          suggestions={suggestions}
          active={activeSearch === "start"}
          onSelect={(place) => chooseLocation("start", place)}
          onLocate={useCurrentLocation}
          icon={<LocateFixed size={17} />}
        />
        <LocationSearch
          label="RIDING TO"
          value={endText}
          onChange={setEndText}
          onFocus={() => setActiveSearch("end")}
          suggestions={suggestions}
          active={activeSearch === "end"}
          onSelect={(place) => chooseLocation("end", place)}
          icon={
            searching && activeSearch === "end" ? (
              <span className="mini-spinner" />
            ) : (
              <Search size={17} />
            )
          }
        />
      </div>

      <button
        className="replan-button"
        onClick={() => loadTrip(start, end)}
        disabled={loading}
      >
        <Route size={16} />
        {loading ? "Building your trip…" : "Find best routes"}
        <ArrowRight size={15} />
      </button>
      {error && (
        <div className="inline-error">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {destinationPhoto && (
        <section className="destination-showcase">
          <img
            src={destinationPhoto.image}
            alt={destinationPhoto.imageAlt || end.name}
          />
          <span className="destination-shade" />
          <div>
            <small>
              <MapPin size={11} /> YOUR DESTINATION
            </small>
            <strong>{end.name}</strong>
            <em>{end.subtitle || "Selected ride destination"}</em>
          </div>
          <span className="photo-credit">
            {destinationPhoto.imageAttribution}
          </span>
        </section>
      )}

      <div className="trip-preferences">
        <label>
          <CalendarDays size={17} />
          <span>
            <small>DEPART</small>
            <input
              type="date"
              value={departureDate}
              min={toDateInput(new Date())}
              onChange={(event) => setDepartureDate(event.target.value)}
            />
          </span>
        </label>
        <button
          onClick={() => {
            setDraftSettings(settings);
            setSettingsOpen(true);
          }}
        >
          <Bike size={18} />
          <span>
            <small>{settings.bikeName.toUpperCase()}</small>
            <strong>
              {settings.mileage} km/L · {settings.riders} rider
              {settings.riders > 1 ? "s" : ""}
            </strong>
          </span>
          <ChevronDown size={15} />
        </button>
      </div>

      <div className="section-title">
        <div>
          <h2>Choose your route</h2>
          <span>
            {routes.length} live option{routes.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button onClick={() => setRouteDetailsOpen(true)}>
          Directions <ChevronRight size={14} />
        </button>
      </div>
      {loading ? (
        <>
          <LoadingLine>Finding rideable roads</LoadingLine>
          <LoadingLine>Comparing time and fuel</LoadingLine>
        </>
      ) : (
        <div className="route-options">
          {routes.map((route, index) => (
            <button
              key={route.id}
              className={`route-card ${selectedId === route.id ? "selected" : ""}`}
              onClick={() => selectRoute(route.id)}
            >
              <span className="radio">
                <i />
              </span>
              <span className="route-copy">
                <span className="route-name">
                  <strong>{route.name}</strong>
                  {index === 0 && (
                    <em>
                      <Sparkles size={11} /> BEST MATCH
                    </em>
                  )}
                </span>
                <span className="route-meta">
                  <b>
                    {unit === "km"
                      ? route.distanceKm.toFixed(0)
                      : (route.distanceKm * 0.621371).toFixed(0)}{" "}
                    {unit}
                  </b>
                  <i />
                  {formatDuration(route.durationMinutes)}
                  <i />
                  {route.provider || "road network"}
                </span>
                <span className="route-note" style={{ color: route.color }}>
                  {route.note}
                </span>
              </span>
              <span className="route-cost">
                <small>ONE-WAY FUEL</small>
                <strong>
                  {formatMoney(
                    route.fuelOneWay ||
                      (route.distanceKm / settings.mileage) *
                        settings.fuelPrice,
                  )}
                </strong>
              </span>
            </button>
          ))}
        </div>
      )}

      <section className="traffic-card">
        <div className="traffic-recommendation">
          <span>
            <Radio size={17} />
          </span>
          <div>
            <small>TRAFFIC-PREDICTED DEPARTURE</small>
            <strong>{departureWindows[0]?.time || departureTime}</strong>
            <em>
              {departureWindows[0]?.traffic || "Low"} expected traffic · save
              about{" "}
              {Math.max(
                0,
                (departureWindows.at(-1)?.adjustedMinutes || 0) -
                  (departureWindows[0]?.adjustedMinutes || 0),
              )}{" "}
              min
            </em>
          </div>
          <span className="prediction-badge">PREDICTED</span>
        </div>
        <div className="traffic-windows">
          {departureWindows.slice(0, 4).map((window) => (
            <button
              key={window.time}
              className={departureTime === window.time ? "active" : ""}
              onClick={() => setDepartureTime(window.time)}
            >
              <strong>{window.time}</strong>
              <span className={`traffic-${window.traffic.toLowerCase()}`}>
                {window.traffic}
              </span>
              <small>{formatDuration(window.adjustedMinutes)}</small>
            </button>
          ))}
        </div>
        <p>
          Based on weekday, departure hour, forecast and typical urban
          congestion—not live road sensors.
        </p>
      </section>

      <section className="route-essentials-card">
        <div className="section-title compact">
          <div>
            <h2>Along your route</h2>
            <span>
              {essentialsLoading
                ? "Scanning the corridor…"
                : `${routeEssentials.length} safety stops found`}
            </span>
          </div>
          <button onClick={() => setPanelMode("discover")}>Map layers</button>
        </div>
        <div className="essential-groups">
          {["fuel", "service", "hospital"].map((category) => {
            const Icon = categoryMeta[category].icon;
            const matches = routeEssentials.filter(
              (place) => place.category === category,
            );
            return (
              <div key={category}>
                <span style={{ color: categoryMeta[category].color }}>
                  <Icon size={15} />
                </span>
                <div>
                  <strong>{categoryMeta[category].label}</strong>
                  <small>
                    {matches.length
                      ? `${matches.length} found along route`
                      : essentialsLoading
                        ? "Searching…"
                        : "None mapped"}
                  </small>
                </div>
                {matches[0] && (
                  <button onClick={() => setSelectedPlace(matches[0])}>
                    {matches[0].routeKm} km <ChevronRight size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="weather-card">
        <div className="weather-head">
          <div>
            <span className="weather-icon">
              {bestWeather ? (
                <WeatherGlyph type={bestWeather.icon} size={22} />
              ) : (
                <CloudSun size={22} />
              )}
            </span>
            <span>
              <small>BEST WINDOW IN 14 DAYS</small>
              <strong>
                {bestWeather
                  ? formatDate(bestWeather.date, {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                    })
                  : "Forecast loading"}
              </strong>
            </span>
          </div>
          {bestWeather && (
            <span className="score">
              {bestWeather.score}
              <small>/10</small>
            </span>
          )}
        </div>
        <div className="weather-days">
          {(chronologicalWeather.length
            ? chronologicalWeather.slice(0, 5)
            : [null, null, null]
          ).map((day, index) =>
            day ? (
              <button
                key={day.date}
                className={departureDate === day.date ? "best" : ""}
                onClick={() => setDepartureDate(day.date)}
              >
                <b>
                  {formatDate(day.date, { weekday: "short" }).toUpperCase()}
                </b>
                <WeatherGlyph type={day.icon} size={17} />
                <strong>{day.max}°</strong>
                <small>{day.rain}% rain</small>
              </button>
            ) : (
              <span key={index} className="weather-skeleton" />
            ),
          )}
        </div>
        {chosenWeather && (
          <p>
            <Sparkles size={13} /> Leave by{" "}
            <strong>
              {chosenWeather.sunrise
                ? new Date(chosenWeather.sunrise).toLocaleTimeString("en-IN", {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "sunrise"}
            </strong>{" "}
            · Return {formatDate(returnDate)} · {chosenWeather.label},{" "}
            {chosenWeather.wind} km/h wind.
          </p>
        )}
      </section>

      <section className="budget-card">
        <div className="section-title compact">
          <div>
            <h2>Complete trip budget</h2>
            <span>
              {settings.roundTrip ? "round trip" : "one way"} ·{" "}
              {settings.riders} rider{settings.riders > 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={() => {
              setDraftSettings(settings);
              setSettingsOpen(true);
            }}
          >
            Edit assumptions
          </button>
        </div>
        <div className="budget-total">
          <span>
            <Wallet size={18} /> Estimated total
          </span>
          <strong>{formatMoney(budget.total)}</strong>
        </div>
        <div className="budget-bars">
          <i
            className="fuel-bar"
            style={{
              width: `${Math.max(6, (budget.fuel / budget.total) * 100)}%`,
            }}
          />
          <i
            className="stay-bar"
            style={{
              width: `${Math.max(6, (budget.stay / budget.total) * 100)}%`,
            }}
          />
          <i
            className="food-bar"
            style={{
              width: `${Math.max(6, (budget.food / budget.total) * 100)}%`,
            }}
          />
          <i className="other-bar" />
        </div>
        <div className="budget-grid">
          <span>
            <i className="dot fuel" />
            <small>Fuel</small>
            <strong>{formatMoney(budget.fuel)}</strong>
          </span>
          <span>
            <i className="dot stay" />
            <small>Stay</small>
            <strong>{formatMoney(budget.stay)}</strong>
          </span>
          <span>
            <i className="dot food" />
            <small>Food</small>
            <strong>{formatMoney(budget.food)}</strong>
          </span>
          <span>
            <i className="dot other" />
            <small>Other</small>
            <strong>{formatMoney(budget.other)}</strong>
          </span>
        </div>
        <p className="estimate-note">
          Estimates use {settings.mileage} km/L,{" "}
          {formatMoney(settings.fuelPrice)}/L and your selected trip setup.
        </p>
      </section>

      <button
        className="itinerary-teaser"
        onClick={() => setPanelMode("itinerary")}
      >
        <span>
          <Sparkles size={18} />
        </span>
        <span>
          <small>AI-GENERATED PLAN</small>
          <strong>{generatedItinerary.days.length}-day itinerary ready</strong>
          <em>Weather, ride, food, stays and sights</em>
        </span>
        <ArrowRight size={17} />
      </button>

      <section className="nearby-section" id="discover">
        <div className="section-title compact">
          <div>
            <h2>Useful stops nearby</h2>
            <span>
              {placesLoading
                ? "Finding food, stays & fuel…"
                : places.some((place) => place.planningFallback)
                  ? `${places.length} planning suggestions`
                  : `${places.length} live OpenStreetMap places`}
            </span>
          </div>
          <button onClick={() => setPanelMode("discover")}>Explore all</button>
        </div>
        {places.slice(0, 4).map((place) => {
          const Icon = categoryMeta[place.category].icon;
          return (
            <button
              className="place-row"
              key={place.id}
              onClick={() => setSelectedPlace(place)}
            >
              <PlacePhoto place={place} Icon={Icon} />
              <span>
                <strong>{place.name}</strong>
                <small>
                  {place.type.replaceAll("_", " ")}
                  {place.planningFallback ? " · suggested" : ""}
                  {place.estimate != null
                    ? ` · est. ${formatMoney(place.estimate)}`
                    : ""}
                </small>
              </span>
              {place.planned ? (
                <Check size={16} className="planned-check" />
              ) : (
                <Plus size={16} />
              )}
            </button>
          );
        })}
        {!placesLoading && places.length === 0 && (
          <p className="empty-copy">
            No mapped places were returned. Try another destination or reload.
          </p>
        )}
      </section>
    </>
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            setPanelMode("plan");
            setMobilePanel(true);
          }}
        >
          <span className="brand-mark">
            <Navigation size={19} strokeWidth={2.6} />
          </span>
          <span>rove</span>
          <small>TRIP OS</small>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={panelMode === "plan" ? "active" : ""}
            onClick={() => {
              setPanelMode("plan");
              setMobilePanel(true);
            }}
          >
            <Navigation size={16} /> Plan route
          </button>
          <button
            className={panelMode === "group" ? "active" : ""}
            onClick={() => {
              setPanelMode("group");
              setMobilePanel(true);
            }}
          >
            <Users size={16} /> Group <em>{groupMembers.length}</em>
          </button>
          <button
            className={panelMode === "history" ? "active" : ""}
            onClick={() => {
              setPanelMode("history");
              setSelectedHistoryId(null);
              setMobilePanel(true);
            }}
          >
            <BookOpen size={16} /> History <em>{history.length}</em>
          </button>
          <button
            className={panelMode === "saved" ? "active" : ""}
            onClick={() => {
              setPanelMode("saved");
              setMobilePanel(true);
            }}
          >
            <Heart size={16} /> Saved <em>{savedTrips.length}</em>
          </button>
        </nav>
        <div className="top-actions">
          <button
            className="unit-switch"
            onClick={() => setUnit(unit === "km" ? "mi" : "km")}
            aria-label="Change distance unit"
          >
            <span className={unit === "km" ? "selected" : ""}>KM</span>
            <span className={unit === "mi" ? "selected" : ""}>MI</span>
          </button>
          <button
            className="icon-button"
            onClick={() =>
              toast("Weather, route and place data are up to date.")
            }
            aria-label="Notifications"
          >
            <Bell size={18} />
            <i />
          </button>
          <button className="avatar" onClick={() => setAccountOpen(true)}>
            {user.name
              .split(/\s+/)
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </button>
          <button
            className="mobile-menu"
            onClick={() => setMobilePanel(!mobilePanel)}
            aria-label="Open planner"
          >
            {mobilePanel ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <section className="planner">
        <aside className={`route-panel ${mobilePanel ? "mobile-open" : ""}`}>
          <div className="panel-scroll">
            {panelMode === "plan" && planContent}
            {panelMode === "discover" && (
              <section className="explore-panel">
                <button
                  className="panel-back"
                  onClick={() => setPanelMode("plan")}
                >
                  <ArrowLeft size={16} /> Back to plan
                </button>
                <p className="eyebrow">
                  <Compass size={13} /> Destination explorer
                </p>
                <h1>Around {end.name}</h1>
                <p className="panel-intro">
                  Mapped places within 18 km, grouped for a rider’s needs. If a
                  live places service is unavailable, clearly labelled planning
                  suggestions keep the trip usable.
                </p>
                <div className="filter-chips">
                  <button
                    className={placeFilter === "all" ? "active" : ""}
                    onClick={() => setPlaceFilter("all")}
                  >
                    All <span>{places.length}</span>
                  </button>
                  {Object.entries(categoryMeta).map(([key, meta]) => (
                    <button
                      key={key}
                      className={placeFilter === key ? "active" : ""}
                      onClick={() => setPlaceFilter(key)}
                    >
                      {meta.label}{" "}
                      <span>
                        {
                          places.filter((place) => place.category === key)
                            .length
                        }
                      </span>
                    </button>
                  ))}
                </div>
                <div className="explore-list">
                  {filteredPlaces.map((place) => {
                    const Icon = categoryMeta[place.category].icon;
                    return (
                      <article className="explore-card" key={place.id}>
                        <button onClick={() => setSelectedPlace(place)}>
                          <PlacePhoto
                            place={place}
                            Icon={Icon}
                            className="explore-photo"
                          />
                          <span>
                            <small>
                              {categoryMeta[place.category].label} ·{" "}
                              {place.type.replaceAll("_", " ")}
                              {place.planningFallback ? " · suggested" : ""}
                            </small>
                            <strong>{place.name}</strong>
                            <em>
                              {place.openingHours || "Hours not mapped"}
                              {place.estimate != null
                                ? ` · Budget estimate ${formatMoney(place.estimate)}`
                                : ""}
                            </em>
                          </span>
                          <ChevronRight size={16} />
                        </button>
                        <button
                          className={place.planned ? "added" : ""}
                          onClick={() => addPlaceToTrip(place)}
                        >
                          {place.planned ? (
                            <>
                              <Check size={13} /> Added
                            </>
                          ) : (
                            <>
                              <Plus size={13} /> Add stop
                            </>
                          )}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
            {panelMode === "saved" && (
              <section className="saved-panel">
                <button
                  className="panel-back"
                  onClick={() => setPanelMode("plan")}
                >
                  <ArrowLeft size={16} /> Back to plan
                </button>
                <p className="eyebrow">
                  <Heart size={13} /> {firebaseModeLabel}
                </p>
                <h1>Saved rides.</h1>
                <p className="panel-intro">
                  Reopen a journey with its bike, budget and date assumptions
                  intact.
                </p>
                {savedTrips.length === 0 ? (
                  <div className="empty-state">
                    <Heart size={26} />
                    <strong>No saved rides yet</strong>
                    <p>Use the heart beside a planned route to keep it here.</p>
                  </div>
                ) : (
                  savedTrips.map((trip) => (
                    <article className="saved-card" key={trip.id}>
                      <button onClick={() => loadSavedTrip(trip)}>
                        <span>
                          <small>{formatDate(trip.departureDate)}</small>
                          <strong>
                            {trip.start.name} <ArrowRight size={12} />{" "}
                            {trip.end.name}
                          </strong>
                          <em>
                            {trip.settings?.nights || 0} night ·{" "}
                            {trip.settings?.riders || 1} rider
                          </em>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                      <button
                        onClick={() =>
                          setSavedTrips((items) =>
                            items.filter((item) => item.id !== trip.id),
                          )
                        }
                      >
                        <X size={14} />
                      </button>
                    </article>
                  ))
                )}
              </section>
            )}
            {panelMode === "group" && (
              <section className="group-panel">
                <button
                  className="panel-back"
                  onClick={() => setPanelMode("plan")}
                >
                  <ArrowLeft size={16} /> Back to trip
                </button>
                <div className="group-heading">
                  <div>
                    <p className="eyebrow">
                      <Users size={13} /> Group ride
                    </p>
                    <h1>Ride together.</h1>
                  </div>
                  <button onClick={shareGroupInvite}>
                    <Share2 size={14} /> Invite
                  </button>
                </div>
                <p className="panel-intro">
                  Build the roster, share the trip and settle every expense
                  fairly.
                </p>
                <div className="group-trip-summary">
                  <Navigation size={18} />
                  <span>
                    <strong>
                      {start.name} → {end.name}
                    </strong>
                    <small>
                      {formatDate(departureDate)} · {departureTime} ·{" "}
                      {activeRoute.distanceKm.toFixed(0)} km
                    </small>
                  </span>
                  <button onClick={shareGroupInvite}>
                    <Copy size={14} />
                  </button>
                </div>
                <div className="section-title compact">
                  <div>
                    <h2>Rider roster</h2>
                    <span>{groupMembers.length} confirmed</span>
                  </div>
                </div>
                <div className="member-list">
                  {groupMembers.map((member, index) => (
                    <div className="member-row" key={member.id}>
                      <span>
                        {member.name
                          .split(/\s+/)
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                      <div>
                        <strong>
                          {member.name}
                          {member.organizer && <em>ORGANIZER</em>}
                        </strong>
                        <small>
                          {member.bike || "Motorcycle"}
                          {member.contact ? ` · ${member.contact}` : ""}
                        </small>
                      </div>
                      <b>{formatMoney(splitPerRider)}</b>
                      {!member.organizer && (
                        <button onClick={() => removeGroupMember(member.id)}>
                          <X size={13} />
                        </button>
                      )}
                      <i>{index + 1}</i>
                    </div>
                  ))}
                </div>
                <div className="add-member-form">
                  <input
                    value={memberDraft.name}
                    onChange={(event) =>
                      setMemberDraft({
                        ...memberDraft,
                        name: event.target.value,
                      })
                    }
                    placeholder="Rider name"
                  />
                  <input
                    value={memberDraft.contact}
                    onChange={(event) =>
                      setMemberDraft({
                        ...memberDraft,
                        contact: event.target.value,
                      })
                    }
                    placeholder="Phone or email"
                  />
                  <input
                    value={memberDraft.bike}
                    onChange={(event) =>
                      setMemberDraft({
                        ...memberDraft,
                        bike: event.target.value,
                      })
                    }
                    placeholder="Bike model"
                  />
                  <button onClick={addGroupMember}>
                    <UserPlus size={14} /> Add rider
                  </button>
                </div>
                <section className="split-card">
                  <div className="split-total">
                    <span>
                      <ReceiptIndianRupee size={18} />
                      <small>
                        {actualExpenseTotal
                          ? "ACTUAL GROUP SPEND"
                          : "ESTIMATED GROUP BUDGET"}
                      </small>
                    </span>
                    <strong>{formatMoney(splitTotal)}</strong>
                  </div>
                  <div className="equal-split">
                    <span>Equal split</span>
                    <strong>
                      {formatMoney(splitPerRider)} <small>per rider</small>
                    </strong>
                  </div>
                </section>
                <div className="section-title compact expense-title">
                  <div>
                    <h2>Expense ledger</h2>
                    <span>{expenses.length} entries</span>
                  </div>
                </div>
                <div className="expense-form">
                  <input
                    value={expenseDraft.description}
                    onChange={(event) =>
                      setExpenseDraft({
                        ...expenseDraft,
                        description: event.target.value,
                      })
                    }
                    placeholder="Petrol, breakfast…"
                  />
                  <input
                    type="number"
                    value={expenseDraft.amount}
                    onChange={(event) =>
                      setExpenseDraft({
                        ...expenseDraft,
                        amount: event.target.value,
                      })
                    }
                    placeholder="₹ amount"
                  />
                  <select
                    value={expenseDraft.paidBy}
                    onChange={(event) =>
                      setExpenseDraft({
                        ...expenseDraft,
                        paidBy: event.target.value,
                      })
                    }
                  >
                    {groupMembers.map((member) => (
                      <option value={member.id} key={member.id}>
                        Paid by {member.name}
                      </option>
                    ))}
                  </select>
                  <button onClick={addExpense}>
                    <Plus size={14} />
                  </button>
                </div>
                {expenses.map((expense) => (
                  <div className="expense-row" key={expense.id}>
                    <span>
                      <ReceiptIndianRupee size={14} />
                    </span>
                    <div>
                      <strong>{expense.description}</strong>
                      <small>
                        {groupMembers.find(
                          (member) => member.id === expense.paidBy,
                        )?.name || "Rider"}{" "}
                        paid
                      </small>
                    </div>
                    <b>{formatMoney(expense.amount)}</b>
                    <button
                      onClick={() =>
                        setExpenses((items) =>
                          items.filter((item) => item.id !== expense.id),
                        )
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {actualExpenseTotal > 0 && (
                  <div className="settlement-list">
                    <small>SETTLEMENT POSITION</small>
                    {riderBalances.map((member) => (
                      <div key={member.id}>
                        <span>{member.name}</span>
                        <b className={member.balance >= 0 ? "receive" : "owe"}>
                          {member.balance >= 0
                            ? `receives ${formatMoney(member.balance)}`
                            : `owes ${formatMoney(Math.abs(member.balance))}`}
                        </b>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {panelMode === "history" && (
              <section className="history-panel">
                {!selectedHistory ? (
                  <>
                    <button
                      className="panel-back"
                      onClick={() => setPanelMode("plan")}
                    >
                      <ArrowLeft size={16} /> Back to trip
                    </button>
                    <p className="eyebrow">
                      <BookOpen size={13} /> Your road archive
                    </p>
                    <h1>Trip history.</h1>
                    <p className="panel-intro">
                      Every completed navigation appears here, ready for notes,
                      ratings and photos.
                    </p>
                    {history.length === 0 ? (
                      <div className="empty-state">
                        <BookOpen size={26} />
                        <strong>No completed rides yet</strong>
                        <p>
                          Finish an in-app navigation to create your first
                          journal entry.
                        </p>
                      </div>
                    ) : (
                      <div className="history-list">
                        {history.map((ride) => (
                          <button
                            key={ride.id}
                            onClick={() => openHistoryRide(ride)}
                          >
                            <span className="history-date">
                              <b>{new Date(ride.endedAt).getDate()}</b>
                              <small>
                                {new Date(ride.endedAt)
                                  .toLocaleDateString("en-IN", {
                                    month: "short",
                                  })
                                  .toUpperCase()}
                              </small>
                            </span>
                            <span>
                              <small>{ride.routeName}</small>
                              <strong>
                                {ride.start.name} → {ride.end.name}
                              </strong>
                              <em>
                                {ride.distanceKm.toFixed(0)} km ·{" "}
                                {formatDuration(ride.durationMinutes)} ·{" "}
                                {ride.groupSize} rider
                                {ride.groupSize > 1 ? "s" : ""}
                              </em>
                            </span>
                            <ChevronRight size={15} />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      className="panel-back"
                      onClick={() => {
                        setSelectedHistoryId(null);
                        setRidePhotos([]);
                      }}
                    >
                      <ArrowLeft size={16} /> All rides
                    </button>
                    <p className="eyebrow">
                      <BookOpen size={13} /> Ride journal
                    </p>
                    <h1>{selectedHistory.end.name}</h1>
                    <p className="panel-intro">
                      {new Date(selectedHistory.endedAt).toLocaleDateString(
                        "en-IN",
                        { dateStyle: "full" },
                      )}{" "}
                      · {selectedHistory.distanceKm.toFixed(0)} km ·{" "}
                      {formatMoney(selectedHistory.budget.total)}
                    </p>
                    <div className="journal-rating">
                      <span>How was this ride?</span>
                      <div>
                        {[1, 2, 3, 4, 5].map((rating) => (
                          <button
                            key={rating}
                            className={journalRating >= rating ? "active" : ""}
                            onClick={() => setJournalRating(rating)}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="journal-notes">
                      <span>RIDE NOTES</span>
                      <textarea
                        value={journalDraft}
                        onChange={(event) =>
                          setJournalDraft(event.target.value)
                        }
                        placeholder="Road conditions, best viewpoints, food discoveries, lessons for next time…"
                      />
                    </label>
                    <button className="save-journal" onClick={saveJournal}>
                      Save journal <Check size={14} />
                    </button>
                    <div className="photo-heading">
                      <div>
                        <h2>Ride photos</h2>
                        <span>{ridePhotos.length} memories</span>
                      </div>
                      <label>
                        <ImagePlus size={14} /> Add photos
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={uploadRidePhotos}
                        />
                      </label>
                    </div>
                    {ridePhotos.length ? (
                      <div className="photo-grid">
                        {ridePhotos.map((photo) => (
                          <figure key={photo.id}>
                            <img
                              src={photo.url || photo.dataUrl}
                              alt={photo.name}
                            />
                            <button
                              onClick={async () => {
                                await deleteRidePhoto(photo, user.id);
                                setRidePhotos((items) =>
                                  items.filter((item) => item.id !== photo.id),
                                );
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </figure>
                        ))}
                      </div>
                    ) : (
                      <label className="photo-empty">
                        <Camera size={23} />
                        <strong>Add moments from your ride</strong>
                        <small>
                          {firebaseConfigured
                            ? "Stored securely in Firebase Storage."
                            : "Stored locally until Firebase is configured."}
                        </small>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={uploadRidePhotos}
                        />
                      </label>
                    )}
                  </>
                )}
              </section>
            )}
            {panelMode === "itinerary" && (
              <section className="itinerary-panel">
                <button
                  className="panel-back"
                  onClick={() => setPanelMode("plan")}
                >
                  <ArrowLeft size={16} /> Back to trip
                </button>
                <div className="itinerary-heading">
                  <div>
                    <p className="eyebrow">
                      <Sparkles size={13} /> Rove trip intelligence
                    </p>
                    <h1>Your ride, organised.</h1>
                  </div>
                  <button
                    onClick={() => setItinerarySeed((value) => value + 1)}
                  >
                    <RefreshCw size={15} /> Regenerate
                  </button>
                </div>
                <p className="panel-intro">
                  Built from your motorcycle route, forecast, budget and nearby
                  places. Times remain flexible for real road conditions.
                </p>
                <div className="itinerary-overview">
                  <span>
                    <Bike size={15} />
                    <b>{activeRoute.distanceKm.toFixed(0)} km</b>
                    <small>one way</small>
                  </span>
                  <span>
                    <CalendarDays size={15} />
                    <b>{generatedItinerary.days.length} days</b>
                    <small>{formatDate(departureDate)} onward</small>
                  </span>
                  <span>
                    <Wallet size={15} />
                    <b>{formatMoney(budget.total)}</b>
                    <small>estimated</small>
                  </span>
                </div>
                {generatedItinerary.days.map((day, dayIndex) => (
                  <article
                    className="itinerary-day"
                    key={`${day.date}-${dayIndex}`}
                  >
                    <header>
                      <span>DAY {dayIndex + 1}</span>
                      <div>
                        <strong>{day.title}</strong>
                        <small>
                          {formatDate(day.date, {
                            weekday: "long",
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          · {day.weather}
                        </small>
                      </div>
                    </header>
                    <div className="timeline">
                      {day.items.map((item, index) => (
                        <div
                          className={`timeline-item type-${item.type}`}
                          key={`${item.time}-${item.title}-${index}`}
                        >
                          <time>{item.time}</time>
                          <i />
                          <div>
                            <strong>{item.title}</strong>
                            <p>{item.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
                <div className="itinerary-actions">
                  <button onClick={exportTrip}>
                    <Download size={14} /> Download plan
                  </button>
                  <button onClick={toggleSaved}>
                    <Heart size={14} fill={isSaved ? "currentColor" : "none"} />
                    {isSaved ? "Saved" : "Save trip"}
                  </button>
                </div>
                <p className="ai-note">
                  <ShieldCheck size={12} /> Generated locally from live trip
                  inputs. Verify roads, opening hours and weather before
                  departure.
                </p>
              </section>
            )}
          </div>
          {panelMode === "plan" && (
            <div className="ride-footer">
              <button
                className={`start-button ${riding ? "riding" : ""}`}
                onClick={riding ? stopNavigation : startNavigation}
              >
                <span>
                  <Navigation size={18} fill="currentColor" />
                  {riding
                    ? `End navigation · ${rideProgress}%`
                    : "Start in-app navigation"}
                </span>
                <span>
                  {activeRoute.distanceKm.toFixed(0)} {unit}{" "}
                  <ArrowRight size={16} />
                </span>
              </button>
            </div>
          )}
        </aside>

        <section
          className={`map-stage ${riding ? "navigation-active" : ""}`}
          aria-label="Interactive 3D route map"
        >
          <Suspense
            fallback={
              <div className="map-loading">
                <Navigation size={26} />
                <strong>Starting the 3D map</strong>
                <span>Loading roads and terrain…</span>
              </div>
            }
          >
            <MapView
              ref={mapRef}
              start={start}
              end={end}
              routes={routes}
              selectedId={selectedId}
              places={mapPlaces}
              visibleCategories={visibleCategories}
              currentPosition={currentPosition}
              onPlaceSelect={setSelectedPlace}
            />
          </Suspense>
          {riding && (
            <section className="navigation-hud">
              <div className="nav-hud-status">
                <span className={`gps-${gpsStatus}`}>
                  <Radio size={12} />
                  {gpsStatus === "live"
                    ? `GPS LIVE${currentPosition?.accuracy ? ` · ±${Math.round(currentPosition.accuracy)} m` : ""}`
                    : gpsStatus === "requesting"
                      ? "CONNECTING GPS"
                      : gpsStatus === "denied"
                        ? "LOCATION PERMISSION BLOCKED"
                        : gpsStatus === "weak"
                          ? "WAITING FOR ACCURATE GPS"
                        : gpsStatus === "timeout"
                          ? "GPS TIMEOUT · RETRYING"
                          : gpsStatus === "unavailable"
                            ? "GPS SIGNAL UNAVAILABLE"
                            : gpsStatus === "insecure"
                              ? "HTTPS REQUIRED FOR GPS"
                              : "ROUTE PREVIEW · GPS UNSUPPORTED"}
                </span>
                <button onClick={stopNavigation}>
                  <X size={16} /> End
                </button>
              </div>
              {rerouting && (
                <div className="reroute-banner">
                  <RefreshCw size={13} /> Recalculating two-wheeler route…
                </div>
              )}
              <div className="next-turn">
                <span>
                  <Navigation size={26} fill="currentColor" />
                </span>
                <div>
                  <small>
                    {navigationState.distanceToTurn != null
                      ? formatNavDistance(navigationState.distanceToTurn)
                      : "Continue"}
                  </small>
                  <strong>
                    {navigationState.progress > 99
                      ? `Arrive at ${end.name}`
                      : navigationState.nextStep?.instruction ||
                        `Continue toward ${end.name}`}
                  </strong>
                </div>
              </div>
              <div className="nav-progress">
                <i style={{ width: `${navigationState.progress}%` }} />
              </div>
              <div className="nav-metrics">
                <span>
                  <b>{formatNavDistance(navigationState.remainingKm)}</b>
                  <small>remaining</small>
                </span>
                <span>
                  <b>
                    {formatDuration(
                      Math.round(navigationState.remainingMinutes),
                    )}
                  </b>
                  <small>ride time</small>
                </span>
                <span>
                  <b>{arrivalTime}</b>
                  <small>arrival</small>
                </span>
                {currentPosition?.speed > 0 && (
                  <span>
                    <b>{Math.round(currentPosition.speed * 3.6)} km/h</b>
                    <small>speed</small>
                  </span>
                )}
              </div>
              <div className="nav-controls">
                <button
                  className={voiceEnabled ? "active" : ""}
                  onClick={() => {
                    setVoiceEnabled(!voiceEnabled);
                    if (voiceEnabled) window.speechSynthesis?.cancel();
                    else lastSpokenRef.current = "";
                  }}
                >
                  {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  {voiceEnabled ? "Voice on" : "Voice off"}
                </button>
                <button
                  className={followNavigation ? "active" : ""}
                  onClick={() => {
                    setFollowNavigation(true);
                    mapRef.current?.followPosition(currentPosition || start);
                  }}
                >
                  <Crosshair size={16} />
                  Recenter
                </button>
              </div>
            </section>
          )}
          <div className="map-status">
            <span className={loading ? "syncing" : ""}>
              <i />
              {loading ? "SYNCING LIVE DATA" : "LIVE TRIP DATA"}
            </span>
            <small>Drag to explore · Ctrl + drag to tilt</small>
          </div>
          <button
            className="back-map"
            onClick={() => setMobilePanel(true)}
            aria-label="Open planner"
          >
            <Menu size={18} />
          </button>
          <div className="map-tools">
            <div className="layers-wrap">
              <button
                className={layersOpen ? "active" : ""}
                onClick={() => setLayersOpen(!layersOpen)}
                aria-label="Map layers"
              >
                <Layers3 size={19} />
              </button>
              {layersOpen && (
                <div className="layers-menu">
                  <strong>Map places</strong>
                  {Object.entries(categoryMeta).map(([key, meta]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={visibleCategories.has(key)}
                        onChange={() =>
                          setVisibleCategories((current) => {
                            const next = new Set(current);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          })
                        }
                      />
                      {meta.label}
                    </label>
                  ))}
                  <button onClick={() => mapRef.current?.togglePitch()}>
                    <Layers3 size={13} /> Toggle 3D tilt
                  </button>
                </div>
              )}
            </div>
            <span>
              <button
                onClick={() => mapRef.current?.zoomIn()}
                aria-label="Zoom in"
              >
                <Plus size={19} />
              </button>
              <button
                onClick={() => mapRef.current?.zoomOut()}
                aria-label="Zoom out"
              >
                <Minus size={19} />
              </button>
            </span>
            <button
              onClick={() => mapRef.current?.recenter()}
              aria-label="Fit route"
            >
              <LocateFixed size={19} />
            </button>
          </div>

          <div className="route-summary-float">
            <div className="route-badge">
              <Navigation size={18} fill="currentColor" />
            </div>
            <div>
              <small>{activeRoute.name.toUpperCase()}</small>
              <strong>{formatDuration(activeRoute.durationMinutes)}</strong>
              <span>
                {activeRoute.distanceKm.toFixed(1)} km · via {activeRoute.road}
              </span>
            </div>
            <div className="summary-stats">
              <span>
                <Fuel size={14} /> {formatMoney(budget.fuel)}
              </span>
              <span>
                <Gauge size={14} /> {elevationGain > 700 ? "Hilly" : "Easy"}
              </span>
              <button onClick={() => setRouteDetailsOpen(true)}>
                <ListChecks size={13} /> Steps
              </button>
            </div>
          </div>
          <div className="elevation-card">
            <div>
              <small>ELEVATION GAIN</small>
              <strong>+{money.format(elevationGain)} m</strong>
            </div>
            <svg viewBox="0 0 170 46" preserveAspectRatio="none">
              <defs>
                <linearGradient id="elev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#e7fe52" stopOpacity=".45" />
                  <stop offset="1" stopColor="#e7fe52" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                className="elev-fill"
                d="M0 43 L0 38 L20 34 L35 36 L51 27 L67 31 L84 21 L101 26 L118 14 L134 19 L151 6 L170 10 L170 46 Z"
              />
              <path
                className="elev-line"
                d="M0 38 L20 34 L35 36 L51 27 L67 31 L84 21 L101 26 L118 14 L134 19 L151 6 L170 10"
              />
            </svg>
            <span>
              <ShieldCheck size={14} /> Route elevation sampled live
            </span>
          </div>
          <button className="sos-button" onClick={() => setSosOpen(true)}>
            <span>
              <Zap size={14} fill="currentColor" />
            </span>{" "}
            SOS
          </button>
        </section>
      </section>

      {settingsOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setSettingsOpen(false)}
        >
          <section
            className="modal settings-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">
                  <Settings2 size={13} /> Cost engine
                </p>
                <h2>Ride & budget setup</h2>
              </div>
              <button onClick={() => setSettingsOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="settings-grid">
              <label className="bike-select-field">
                <span>
                  Your bike <small>sets route profile & mileage</small>
                </span>
                <select
                  value={draftSettings.bikeId}
                  onChange={(event) => {
                    const bike = BIKE_PRESETS.find(
                      (item) => item.id === event.target.value,
                    );
                    setDraftSettings({
                      ...draftSettings,
                      bikeId: bike.id,
                      bikeName: bike.name,
                      mileage: bike.mileage,
                    });
                  }}
                >
                  {BIKE_PRESETS.map((bike) => (
                    <option key={bike.id} value={bike.id}>
                      {bike.name} · {bike.description}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  Bike mileage <small>km/L</small>
                </span>
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={draftSettings.mileage}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      mileage: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                <span>
                  Fuel price <small>₹/L</small>
                </span>
                <input
                  type="number"
                  min="1"
                  value={draftSettings.fuelPrice}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      fuelPrice: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                <span>Riders</span>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={draftSettings.riders}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      riders: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                <span>Nights</span>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={draftSettings.nights}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      nights: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                <span>
                  Stay per night <small>₹</small>
                </span>
                <input
                  type="number"
                  min="0"
                  value={draftSettings.stayPerNight}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      stayPerNight: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                <span>
                  Food per rider/day <small>₹</small>
                </span>
                <input
                  type="number"
                  min="0"
                  value={draftSettings.foodPerDay}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      foodPerDay: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                <span>
                  Parking & other <small>₹</small>
                </span>
                <input
                  type="number"
                  min="0"
                  value={draftSettings.otherCosts}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      otherCosts: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="toggle-label">
                <span>Round trip</span>
                <input
                  type="checkbox"
                  checked={draftSettings.roundTrip}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      roundTrip: event.target.checked,
                    })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={() => setSettingsOpen(false)}>Cancel</button>
              <button
                onClick={() => {
                  setSettings(draftSettings);
                  setSettingsOpen(false);
                  loadTrip(start, end, draftSettings);
                  toast("Bike, route and budget updated.");
                }}
              >
                Apply setup <ArrowRight size={15} />
              </button>
            </div>
          </section>
        </div>
      )}

      {accountOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setAccountOpen(false)}
        >
          <section
            className="modal account-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">
                  <UserRound size={13} /> Rider account
                </p>
                <h2>{user.name}</h2>
              </div>
              <button onClick={() => setAccountOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="account-identity">
              <span>
                {user.name
                  .split(/\s+/)
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <div>
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </div>
            </div>
            <div className={`cloud-sync-bar account-cloud ${cloudSync}`}>
              <span>
                <i />
                {firebaseModeLabel}
              </span>
              <small>
                {cloudSync === "syncing"
                  ? "Saving…"
                  : cloudSync === "loading"
                    ? "Loading…"
                    : cloudSync === "error"
                      ? "Connection needs attention"
                      : "Up to date"}
              </small>
            </div>
            <div className="account-stats">
              <span>
                <b>{savedTrips.length}</b>
                <small>Saved rides</small>
              </span>
              <span>
                <b>{settings.bikeName}</b>
                <small>Current bike</small>
              </span>
            </div>
            <button
              className="account-settings"
              onClick={() => {
                setAccountOpen(false);
                setDraftSettings(settings);
                setSettingsOpen(true);
              }}
            >
              <Settings2 size={16} /> Ride and budget settings{" "}
              <ChevronRight size={15} />
            </button>
            <button className="logout-button" onClick={onLogout}>
              <LogOut size={16} /> Log out
            </button>
            <p className="honesty-note">
              {firebaseConfigured
                ? "Authentication, trips, journals and photos sync through your Firebase project."
                : "Add Firebase environment values to enable cloud authentication and cross-device sync."}
            </p>
          </section>
        </div>
      )}

      {selectedPlace && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setSelectedPlace(null)}
        >
          <section
            className="modal place-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">
                  {categoryMeta[selectedPlace.category].label}
                </p>
                <h2>{selectedPlace.name}</h2>
              </div>
              <button onClick={() => setSelectedPlace(null)}>
                <X size={18} />
              </button>
            </header>
            <div
              className={`place-hero ${selectedPlace.category}`}
              style={
                selectedPlace.image
                  ? {
                      backgroundImage: `linear-gradient(0deg, rgba(9,13,10,.82), rgba(9,13,10,.12)), url(${JSON.stringify(selectedPlace.image)})`,
                    }
                  : undefined
              }
            >
              {(() => {
                const Icon = categoryMeta[selectedPlace.category].icon;
                return <Icon size={31} />;
              })()}
              <span>{selectedPlace.type.replaceAll("_", " ")}</span>
              {selectedPlace.imageAttribution && (
                <small>{selectedPlace.imageAttribution}</small>
              )}
            </div>
            <dl>
              <div>
                <dt>Planning price</dt>
                <dd>
                  {selectedPlace.estimate == null
                    ? "No price data"
                    : selectedPlace.estimate === 0
                      ? "Usually free"
                      : `${formatMoney(selectedPlace.estimate)} estimate`}
                </dd>
              </div>
              <div>
                <dt>Opening hours</dt>
                <dd>{selectedPlace.openingHours || "Not mapped"}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>
                  {selectedPlace.planningFallback
                    ? "Rove planning fallback"
                    : "OpenStreetMap community data"}
                </dd>
              </div>
              {selectedPlace.imagePage && (
                <div>
                  <dt>Location photo</dt>
                  <dd>
                    <a
                      href={selectedPlace.imagePage}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {selectedPlace.imageAttribution || "View photo source"}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            <p className="honesty-note">
              {[
                "wikimedia-geosearch",
                "wikimedia-name-search",
                "wikimedia-area",
                "osm-tagged-image",
              ].includes(selectedPlace.imageSource)
                ? selectedPlace.imageSource === "wikimedia-area"
                  ? "This is real geotagged area imagery near the suggested pin, not a photo of a verified venue or a live camera feed. "
                  : "This is a real venue or geotagged community photo, not a live camera feed. "
                : ""}
              Availability, menu prices and room rates can change. Confirm
              directly before you ride.
            </p>
            <div className="modal-actions stacked">
              <button
                onClick={() =>
                  window.open(
                    `https://www.openstreetmap.org/?mlat=${selectedPlace.lat}&mlon=${selectedPlace.lon}#map=16/${selectedPlace.lat}/${selectedPlace.lon}`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                View on map <ExternalLink size={14} />
              </button>
              {selectedPlace.category === "stay" && selectedPlace.estimate ? (
                <button
                  onClick={() => {
                    applyStayPrice(selectedPlace);
                    setSelectedPlace(null);
                  }}
                >
                  Use in budget & add <Plus size={14} />
                </button>
              ) : (
                <button
                  onClick={() => {
                    addPlaceToTrip(selectedPlace);
                    setSelectedPlace(null);
                  }}
                >
                  {selectedPlace.planned ? "Remove from trip" : "Add to trip"}{" "}
                  <Plus size={14} />
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {routeDetailsOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setRouteDetailsOpen(false)}
        >
          <section
            className="modal directions-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">
                  <Navigation size={13} /> Turn overview
                </p>
                <h2>{activeRoute.name}</h2>
              </div>
              <button onClick={() => setRouteDetailsOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="route-detail-summary">
              <strong>{activeRoute.distanceKm.toFixed(1)} km</strong>
              <span>{formatDuration(activeRoute.durationMinutes)}</span>
              <span>{formatMoney(budget.fuel)} fuel</span>
            </div>
            <div className="directions-list">
              {activeRoute.steps?.length ? (
                activeRoute.steps.slice(0, 24).map((step, index) => (
                  <div key={`${step.instruction}-${index}`}>
                    <span>{index + 1}</span>
                    <p>
                      <strong>{step.instruction}</strong>
                      <small>
                        {step.distance < 1000
                          ? `${Math.round(step.distance)} m`
                          : `${(step.distance / 1000).toFixed(1)} km`}
                      </small>
                    </p>
                  </div>
                ))
              ) : (
                <div className="empty-copy">
                  Detailed turns are unavailable for this preview route.
                </div>
              )}
            </div>
            <div className="modal-actions stacked">
              <button onClick={exportTrip}>
                <Download size={14} /> Download itinerary
              </button>
              <button onClick={startNavigation}>
                Start in-app navigation <Navigation size={14} />
              </button>
            </div>
          </section>
        </div>
      )}

      {sosOpen && (
        <div
          className="modal-backdrop danger"
          onMouseDown={() => setSosOpen(false)}
        >
          <section
            className="modal sos-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">
                  <ShieldCheck size={13} /> Rider safety
                </p>
                <h2>Emergency tools</h2>
              </div>
              <button onClick={() => setSosOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="sos-location">
              <LocateFixed size={18} />
              <span>
                <strong>
                  {currentPosition
                    ? `${currentPosition.lat.toFixed(5)}, ${currentPosition.lon.toFixed(5)}`
                    : start.name}
                </strong>
                <small>
                  {currentPosition
                    ? "Live coordinates"
                    : "Start location — enable navigation for live tracking"}
                </small>
              </span>
            </div>
            <a className="emergency-call" href="tel:112">
              <Phone size={18} fill="currentColor" /> Call emergency services —
              112
            </a>
            <button
              className="share-location"
              onClick={async () => {
                const point = currentPosition || start;
                await navigator.clipboard?.writeText(
                  `My location: https://maps.google.com/?q=${point.lat},${point.lon}`,
                );
                toast("Emergency location copied.");
                setSosOpen(false);
              }}
            >
              <Share2 size={17} /> Copy location link
            </button>
            <p className="honesty-note">
              Use local emergency numbers outside India. Rove does not replace
              emergency services.
            </p>
          </section>
        </div>
      )}

      {notice && (
        <div className="toast">
          <CircleDollarSign size={17} />
          {notice}
        </div>
      )}
    </main>
  );
}

function App() {
  const [user, setUser] = useState(() =>
    firebaseConfigured ? null : getSession(),
  );
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  useEffect(
    () =>
      observeAuthState((currentUser) => {
        setUser(currentUser);
        setAuthReady(true);
      }),
    [],
  );
  if (!authReady)
    return (
      <main className="auth-loading">
        <span className="mini-spinner" />
        <strong>Connecting to Firebase…</strong>
      </main>
    );
  if (!user) return <AuthScreen onAuthenticated={setUser} />;
  return (
    <TripPlanner
      key={user.id}
      user={user}
      onLogout={async () => {
        await clearSession();
        setUser(null);
      }}
    />
  );
}

export default App;
