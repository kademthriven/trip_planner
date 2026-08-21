export const places = [
  { id: "bengaluru", name: "Bengaluru", region: "Karnataka", type: "city", lat: 12.9716, lng: 77.5946, blurb: "The starting point for hill, heritage and coffee-country rides." },
  { id: "devanahalli", name: "Devanahalli", region: "Karnataka", type: "fort town", lat: 13.2465, lng: 77.7118, blurb: "A historic town on the open road north of Bengaluru." },
  { id: "chikkaballapur", name: "Chikkaballapur", region: "Karnataka", type: "market town", lat: 13.4355, lng: 77.7315, blurb: "A gateway to granite hills, vineyards and rural Karnataka." },
  { id: "nandi-hills", name: "Nandi Hills", region: "Karnataka", type: "hill station", lat: 13.3702, lng: 77.6835, blurb: "A classic sunrise ride above the Deccan plateau." },
  { id: "skandagiri", name: "Skandagiri", region: "Karnataka", type: "hill trail", lat: 13.4181, lng: 77.6832, blurb: "A rugged hill known for dawn treks and cloud views." },
  { id: "lepakshi", name: "Lepakshi", region: "Andhra Pradesh", type: "heritage village", lat: 13.8037, lng: 77.6086, blurb: "Vijayanagara murals, stone craft and a monumental Nandi." },
  { id: "ramanagara", name: "Ramanagara", region: "Karnataka", type: "rock country", lat: 12.7159, lng: 77.2813, blurb: "Granite outcrops and silk-town roads southwest of Bengaluru." },
  { id: "mysuru", name: "Mysuru", region: "Karnataka", type: "heritage city", lat: 12.2958, lng: 76.6394, blurb: "Palaces, markets and a relaxed cultural rhythm." },
  { id: "hassan", name: "Hassan", region: "Karnataka", type: "temple gateway", lat: 13.0033, lng: 76.1004, blurb: "The crossroads for Hoysala temples and Western Ghats rides." },
  { id: "chikmagalur", name: "Chikmagalur", region: "Karnataka", type: "coffee hills", lat: 13.3161, lng: 75.772, blurb: "Coffee estates, forest bends and high Western Ghats peaks." },
];

export const interests = [
  { id: "scenic-rides", name: "Scenic rides", emoji: "↗" },
  { id: "viewpoints", name: "Viewpoints", emoji: "◉" },
  { id: "heritage", name: "Heritage", emoji: "◇" },
  { id: "local-food", name: "Local food", emoji: "○" },
  { id: "hiking", name: "Hiking", emoji: "△" },
  { id: "wildlife", name: "Wildlife", emoji: "◌" },
  { id: "coffee", name: "Coffee country", emoji: "∿" },
  { id: "photography", name: "Photography", emoji: "◎" },
];

export const roads = [
  { from: "bengaluru", to: "devanahalli", name: "NH 44", distanceKm: 40, minutes: 55, scenicScore: 6.8, character: "fast airport corridor" },
  { from: "devanahalli", to: "nandi-hills", name: "Nandi Hills Road", distanceKm: 25, minutes: 43, scenicScore: 8.7, character: "vineyard and hill road" },
  { from: "bengaluru", to: "chikkaballapur", name: "NH 44", distanceKm: 61, minutes: 78, scenicScore: 7.1, character: "open highway" },
  { from: "chikkaballapur", to: "nandi-hills", name: "SH 74", distanceKm: 24, minutes: 38, scenicScore: 8.4, character: "rural hill approach" },
  { from: "devanahalli", to: "skandagiri", name: "Kalavara Road", distanceKm: 31, minutes: 50, scenicScore: 8.1, character: "village backroad" },
  { from: "skandagiri", to: "nandi-hills", name: "Hill Link Road", distanceKm: 19, minutes: 38, scenicScore: 9.1, character: "granite hill road" },
  { from: "chikkaballapur", to: "skandagiri", name: "Kalavara Road", distanceKm: 9, minutes: 20, scenicScore: 8.3, character: "short foothill road" },
  { from: "chikkaballapur", to: "lepakshi", name: "NH 44 & Lepakshi Road", distanceKm: 69, minutes: 78, scenicScore: 7.5, character: "dry plateau highway" },
  { from: "nandi-hills", to: "lepakshi", name: "Gudibande Road", distanceKm: 84, minutes: 112, scenicScore: 8.2, character: "quiet heritage road" },
  { from: "bengaluru", to: "ramanagara", name: "Mysuru Road", distanceKm: 51, minutes: 76, scenicScore: 6.9, character: "granite corridor" },
  { from: "ramanagara", to: "mysuru", name: "NH 275", distanceKm: 94, minutes: 105, scenicScore: 7.3, character: "silk and sugarcane road" },
  { from: "bengaluru", to: "mysuru", name: "NH 275", distanceKm: 145, minutes: 170, scenicScore: 6.7, character: "express corridor" },
  { from: "mysuru", to: "hassan", name: "SH 57", distanceKm: 118, minutes: 155, scenicScore: 7.9, character: "farmland and temple road" },
  { from: "bengaluru", to: "hassan", name: "NH 75", distanceKm: 183, minutes: 235, scenicScore: 7.2, character: "westbound highway" },
  { from: "hassan", to: "chikmagalur", name: "Belur Road", distanceKm: 62, minutes: 92, scenicScore: 8.8, character: "temple to coffee hills" },
  { from: "mysuru", to: "chikmagalur", name: "Holenarasipura Road", distanceKm: 178, minutes: 245, scenicScore: 8.1, character: "country road" },
  { from: "ramanagara", to: "hassan", name: "Kunigal Road", distanceKm: 146, minutes: 205, scenicScore: 7.7, character: "lake and farm road" },
];

export const experiences = [
  { id: "bengaluru-breakfast", placeId: "bengaluru", name: "Dawn darshini breakfast", category: "food", durationMins: 50, cost: 180, description: "Begin the ride with crisp dosa, filter coffee and a quick local breakfast.", tags: ["local-food", "coffee"] },
  { id: "bengaluru-heritage", placeId: "bengaluru", name: "Pete heritage lanes", category: "culture", durationMins: 100, cost: 0, description: "Trace the old market city's temples, trading streets and flower sellers.", tags: ["heritage", "photography"] },
  { id: "devanahalli-fort", placeId: "devanahalli", name: "Devanahalli Fort circuit", category: "culture", durationMins: 75, cost: 0, description: "Walk the compact fort walls and old settlement before continuing north.", tags: ["heritage", "photography"] },
  { id: "vineyard-road", placeId: "devanahalli", name: "Vineyard backroad pause", category: "nature", durationMins: 60, cost: 350, description: "Leave the highway for quieter agricultural roads beneath Nandi's slopes.", tags: ["scenic-rides", "local-food"] },
  { id: "nandi-sunrise", placeId: "nandi-hills", name: "Nandi sunrise viewpoint", category: "nature", durationMins: 120, cost: 50, description: "Reach the summit early for cool air and views across the plateau.", tags: ["viewpoints", "photography", "scenic-rides"] },
  { id: "bhoga-nandeeshwara", placeId: "nandi-hills", name: "Bhoga Nandeeshwara temple", category: "culture", durationMins: 90, cost: 0, description: "Explore a layered Dravidian temple complex at the foot of the hills.", tags: ["heritage", "photography"] },
  { id: "skandagiri-trek", placeId: "skandagiri", name: "Skandagiri dawn trek", category: "adventure", durationMins: 240, cost: 450, description: "Climb the granite ridge under the stars and meet the sunrise above cloud.", tags: ["hiking", "viewpoints", "photography"] },
  { id: "kalavara-village", placeId: "skandagiri", name: "Kalavara village breakfast", category: "food", durationMins: 60, cost: 220, description: "Refuel with simple Karnataka food near the trailhead.", tags: ["local-food", "hiking"] },
  { id: "chikkaballapur-market", placeId: "chikkaballapur", name: "Morning produce market", category: "food", durationMins: 60, cost: 150, description: "Meet growers and taste seasonal fruit from the surrounding farms.", tags: ["local-food", "photography"] },
  { id: "avalabetta", placeId: "chikkaballapur", name: "Avalabetta hill detour", category: "nature", durationMins: 150, cost: 0, description: "Take a quiet backroad to a lesser-known granite viewpoint.", tags: ["scenic-rides", "viewpoints", "hiking"] },
  { id: "lepakshi-temple", placeId: "lepakshi", name: "Veerabhadra Temple murals", category: "culture", durationMins: 120, cost: 0, description: "Read Vijayanagara stories through painted ceilings and carved stone pillars.", tags: ["heritage", "photography"] },
  { id: "lepakshi-nandi", placeId: "lepakshi", name: "Monolithic Nandi stop", category: "culture", durationMins: 45, cost: 0, description: "Pause at one of India's largest monolithic Nandi sculptures.", tags: ["heritage", "photography"] },
  { id: "ramanagara-climb", placeId: "ramanagara", name: "Ramadevara Betta trail", category: "adventure", durationMins: 180, cost: 25, description: "Climb through granite terrain known for vultures and wide valley views.", tags: ["hiking", "wildlife", "viewpoints"] },
  { id: "ramanagara-silk", placeId: "ramanagara", name: "Silk cocoon market", category: "culture", durationMins: 75, cost: 0, description: "See the trading network behind Karnataka's silk industry.", tags: ["heritage", "photography"] },
  { id: "mysuru-palace", placeId: "mysuru", name: "Mysuru Palace at dusk", category: "culture", durationMins: 150, cost: 120, description: "Explore royal architecture as the palace lights come alive.", tags: ["heritage", "photography"] },
  { id: "devaraja-market", placeId: "mysuru", name: "Devaraja Market tasting walk", category: "food", durationMins: 90, cost: 300, description: "Follow spice, flower, fruit and sweet stalls through the historic market.", tags: ["local-food", "heritage", "photography"] },
  { id: "belur-temple", placeId: "hassan", name: "Belur stone stories", category: "culture", durationMins: 150, cost: 0, description: "Study intricate Hoysala craftsmanship with a local guide.", tags: ["heritage", "photography"] },
  { id: "shettihalli", placeId: "hassan", name: "Shettihalli church ride", category: "nature", durationMins: 120, cost: 0, description: "Ride country roads to atmospheric ruins beside the reservoir.", tags: ["scenic-rides", "heritage", "photography"] },
  { id: "mullayanagiri", placeId: "chikmagalur", name: "Mullayanagiri summit road", category: "adventure", durationMins: 180, cost: 0, description: "Climb Karnataka's highest road-accessible peak through tight mountain bends.", tags: ["scenic-rides", "viewpoints", "hiking"] },
  { id: "coffee-estate", placeId: "chikmagalur", name: "Coffee estate walk and tasting", category: "food", durationMins: 150, cost: 600, description: "Learn how shade-grown coffee moves from berry to filter cup.", tags: ["coffee", "local-food", "wildlife"] },
];

export const travelers = [
  { id: "arjun", name: "Arjun", persona: "sunrise rider", loves: ["scenic-rides", "viewpoints", "photography"], saved: [{ experienceId: "nandi-sunrise", rating: 5 }, { experienceId: "avalabetta", rating: 4 }, { experienceId: "mullayanagiri", rating: 5 }] },
  { id: "meera", name: "Meera", persona: "heritage explorer", loves: ["heritage", "local-food", "photography"], saved: [{ experienceId: "lepakshi-temple", rating: 5 }, { experienceId: "mysuru-palace", rating: 5 }, { experienceId: "belur-temple", rating: 5 }] },
  { id: "kabir", name: "Kabir", persona: "weekend trekker", loves: ["hiking", "wildlife", "viewpoints"], saved: [{ experienceId: "skandagiri-trek", rating: 5 }, { experienceId: "ramanagara-climb", rating: 4 }, { experienceId: "mullayanagiri", rating: 5 }] },
  { id: "ananya", name: "Ananya", persona: "coffee road collector", loves: ["coffee", "local-food", "scenic-rides"], saved: [{ experienceId: "bengaluru-breakfast", rating: 4 }, { experienceId: "coffee-estate", rating: 5 }, { experienceId: "vineyard-road", rating: 4 }] },
  { id: "vivek", name: "Vivek", persona: "backroad photographer", loves: ["photography", "scenic-rides", "heritage"], saved: [{ experienceId: "shettihalli", rating: 5 }, { experienceId: "lepakshi-nandi", rating: 4 }, { experienceId: "nandi-sunrise", rating: 5 }] },
];

export const bidirectionalRoads = roads.flatMap((road) => [road, { ...road, from: road.to, to: road.from }]);
