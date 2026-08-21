export const bootstrapQuery = `
MATCH (place:Place)
WITH collect(properties(place)) AS places
MATCH (interest:Interest)
WITH places, collect(properties(interest)) AS interests
MATCH (host:Place)-[:HOSTS]->(experience:Experience)-[:TAGGED]->(tag:Interest)
WITH places, interests, host, experience, collect(properties(tag)) AS tags
ORDER BY experience.name
RETURN places, interests,
       collect({experience: properties(experience), place: properties(host), tags: tags})[0..6] AS featured
`;

export const routeQuery = `
MATCH path=(origin:Place {id: $from})-[:ROAD*1..8]->(destination:Place {id: $to})
WHERE size(relationships(path)) <= $maxHops
  AND all(place IN nodes(path) WHERE single(other IN nodes(path) WHERE other = place))
WITH path,
     reduce(km = 0.0, road IN relationships(path) | km + road.distanceKm) AS distanceKm,
     reduce(mins = 0, road IN relationships(path) | mins + road.minutes) AS minutes,
     reduce(scenic = 0.0, road IN relationships(path) | scenic + road.scenicScore)
       / size(relationships(path)) AS scenicScore
RETURN [place IN nodes(path) | properties(place)] AS stops,
       [road IN relationships(path) | properties(road)] AS legs,
       distanceKm, minutes, scenicScore
ORDER BY scenicScore DESC, distanceKm ASC
LIMIT 4
`;

export const recommendationsQuery = `
MATCH (place:Place)-[:HOSTS]->(experience:Experience)-[:TAGGED]->(tag:Interest)
WHERE place.id IN $placeIds
WITH place, experience, collect(DISTINCT tag) AS tags
WITH place, experience, tags, [tag IN tags WHERE tag.id IN $interests] AS matched
WHERE size(matched) > 0
OPTIONAL MATCH (kindred:Traveler)-[:LOVES]->(shared:Interest)<-[:TAGGED]-(experience)
WHERE shared.id IN $interests
OPTIONAL MATCH (kindred)-[save:SAVED]->(experience)
RETURN properties(place) AS place,
       properties(experience) AS experience,
       [tag IN tags | properties(tag)] AS tags,
       [tag IN matched | properties(tag)] AS matched,
       count(DISTINCT kindred) AS kindredCount,
       avg(save.rating) AS communityRating
ORDER BY size(matched) DESC, communityRating DESC, experience.name
LIMIT 12
`;

export const relatedQuery = `
MATCH (seed:Experience {id: $experienceId})-[:TAGGED]->(shared:Interest)<-[:TAGGED]-(related:Experience)
WHERE related <> seed
MATCH (place:Place)-[:HOSTS]->(related)
OPTIONAL MATCH (traveler:Traveler)-[:SAVED]->(seed)
OPTIONAL MATCH (traveler)-[alsoSaved:SAVED]->(related)
WITH seed, related, place, collect(DISTINCT shared) AS overlap,
     count(DISTINCT CASE WHEN alsoSaved IS NOT NULL THEN traveler END) AS fellowTravelers,
     avg(alsoSaved.rating) AS rating
RETURN properties(seed) AS seed,
       properties(related) AS experience,
       properties(place) AS place,
       [tag IN overlap | properties(tag)] AS sharedInterests,
       fellowTravelers, rating
ORDER BY size(overlap) DESC, fellowTravelers DESC, rating DESC
LIMIT 6
`;

export const riderByEmailQuery = `
MATCH (rider:Rider {email: $email})
RETURN properties(rider) AS rider
LIMIT 1
`;

export const createRiderQuery = `
CREATE (rider:Rider {
  id: $id,
  name: $name,
  email: $email,
  passwordHash: $passwordHash,
  passwordSalt: $passwordSalt,
  createdAt: $createdAt,
  updatedAt: $createdAt
})
RETURN properties(rider) AS rider
`;

export const riderStateQuery = `
MATCH (rider:Rider {id: $riderId})
RETURN rider.savedTripsJson AS savedTripsJson,
       rider.groupMembersJson AS groupMembersJson,
       rider.expensesJson AS expensesJson,
       rider.historyJson AS historyJson,
       rider.settingsJson AS settingsJson
LIMIT 1
`;

export const saveRiderStateQuery = `
MATCH (rider:Rider {id: $riderId})
SET rider.savedTripsJson = $savedTripsJson,
    rider.groupMembersJson = $groupMembersJson,
    rider.expensesJson = $expensesJson,
    rider.historyJson = $historyJson,
    rider.settingsJson = $settingsJson,
    rider.updatedAt = $updatedAt
RETURN rider.id AS riderId
`;

export const riderPhotosQuery = `
MATCH (:Rider {id: $riderId})-[:OWNS_PHOTO]->(photo:RidePhoto {historyId: $historyId})
RETURN properties(photo) AS photo
ORDER BY photo.createdAt DESC
`;

export const createPhotoQuery = `
MATCH (rider:Rider {id: $riderId})
CREATE (rider)-[:OWNS_PHOTO]->(photo:RidePhoto {
  id: $id,
  historyId: $historyId,
  userId: $riderId,
  name: $name,
  type: $type,
  dataUrl: $dataUrl,
  createdAt: $createdAt
})
RETURN properties(photo) AS photo
`;

export const deletePhotoQuery = `
MATCH (:Rider {id: $riderId})-[:OWNS_PHOTO]->(photo:RidePhoto {id: $photoId})
WITH photo, properties(photo) AS deleted
DETACH DELETE photo
RETURN deleted
`;
