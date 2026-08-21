// Route discovery: a variable-length, cycle-free multi-hop traversal.
MATCH path=(origin:Place {id: $from})-[:ROAD*1..8]->(destination:Place {id: $to})
WHERE size(relationships(path)) <= $maxHops
  AND all(place IN nodes(path) WHERE single(other IN nodes(path) WHERE other = place))
WITH path,
     reduce(km = 0.0, road IN relationships(path) | km + road.distanceKm) AS distanceKm,
     reduce(scenic = 0.0, road IN relationships(path) | scenic + road.scenicScore)
       / size(relationships(path)) AS scenicScore
RETURN [place IN nodes(path) | properties(place)] AS stops, distanceKm, scenicScore
ORDER BY scenicScore DESC, distanceKm ASC
LIMIT 4;

// Graph-native recommendation: connect route places to experiences, interests,
// and like-minded travelers without building a fixed chain of SQL joins.
MATCH (place:Place)-[:HOSTS]->(experience:Experience)-[:TAGGED]->(tag:Interest)
WHERE place.id IN $placeIds
WITH place, experience, collect(DISTINCT tag) AS tags
WITH place, experience, tags, [tag IN tags WHERE tag.id IN $interests] AS matched
WHERE size(matched) > 0
OPTIONAL MATCH (kindred:Traveler)-[:LOVES]->(shared:Interest)<-[:TAGGED]-(experience)
WHERE shared.id IN $interests
OPTIONAL MATCH (kindred)-[save:SAVED]->(experience)
RETURN place.name, experience.name,
       [tag IN matched | tag.name] AS whyItFits,
       count(DISTINCT kindred) AS kindredTravelers,
       avg(save.rating) AS communityRating
ORDER BY size(matched) DESC, communityRating DESC
LIMIT 12;

// Serendipity query: traverse through shared interests and co-saves to explain
// why a seemingly unrelated experience belongs in the same travel constellation.
MATCH (seed:Experience {id: $experienceId})-[:TAGGED]->(shared:Interest)<-[:TAGGED]-(related:Experience)
WHERE related <> seed
MATCH (place:Place)-[:HOSTS]->(related)
OPTIONAL MATCH (traveler:Traveler)-[:SAVED]->(seed)
OPTIONAL MATCH (traveler)-[alsoSaved:SAVED]->(related)
RETURN related.name, place.name, collect(DISTINCT shared.name) AS sharedInterests,
       count(DISTINCT CASE WHEN alsoSaved IS NOT NULL THEN traveler END) AS fellowTravelers
ORDER BY size(sharedInterests) DESC, fellowTravelers DESC
LIMIT 6;
