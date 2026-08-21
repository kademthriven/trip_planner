import express from "express";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { DemoRepository } from "./demo-repository.js";
import { Neo4jRepository } from "./neo4j-repository.js";

const app = express();
const repository = config.demoMode
  ? new DemoRepository()
  : new Neo4jRepository(config.neo4j);

app.disable("x-powered-by");
app.use(express.json({ limit: "4mb" }));

const passwordDigest = (password, salt) => scryptSync(password, salt, 64).toString("hex");
const publicRider = (rider) => ({ id: rider.id, name: rider.name, email: rider.email });
const parseJson = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

app.get("/api/health", async (_request, response, next) => {
  try {
    await repository.verify();
    response.json({ ok: true, mode: repository.mode });
  } catch (error) {
    next(error);
  }
});

app.get("/api/bootstrap", async (_request, response, next) => {
  try {
    response.json({ ...(await repository.bootstrap()), mode: repository.mode });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/register", async (request, response, next) => {
  const name = String(request.body?.name || "").trim();
  const email = String(request.body?.email || "").trim().toLowerCase();
  const password = String(request.body?.password || "");
  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return response.status(400).json({ error: "Enter a name, valid email, and password of at least 8 characters." });
  }
  try {
    if (await repository.findRiderByEmail(email)) {
      return response.status(409).json({ error: "An account with this email already exists." });
    }
    const passwordSalt = randomBytes(16).toString("hex");
    const rider = await repository.createRider({
      id: randomUUID(),
      name,
      email,
      passwordSalt,
      passwordHash: passwordDigest(password, passwordSalt),
      createdAt: new Date().toISOString(),
    });
    response.status(201).json({ user: publicRider(rider) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (request, response, next) => {
  const email = String(request.body?.email || "").trim().toLowerCase();
  const password = String(request.body?.password || "");
  try {
    const rider = await repository.findRiderByEmail(email);
    if (!rider) return response.status(401).json({ error: "Email or password is incorrect." });
    const expected = Buffer.from(rider.passwordHash, "hex");
    const supplied = Buffer.from(passwordDigest(password, rider.passwordSalt), "hex");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return response.status(401).json({ error: "Email or password is incorrect." });
    }
    response.json({ user: publicRider(rider) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/riders/:id/state", async (request, response, next) => {
  try {
    const state = await repository.getRiderState(String(request.params.id));
    response.json({
      savedTrips: parseJson(state?.savedTripsJson, []),
      groupMembers: parseJson(state?.groupMembersJson, []),
      expenses: parseJson(state?.expensesJson, []),
      history: parseJson(state?.historyJson, []),
      settings: parseJson(state?.settingsJson, null),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/riders/:id/state", async (request, response, next) => {
  const riderId = String(request.params.id);
  const data = request.body || {};
  try {
    const saved = await repository.saveRiderState(riderId, {
      savedTripsJson: JSON.stringify(Array.isArray(data.savedTrips) ? data.savedTrips : []),
      groupMembersJson: JSON.stringify(Array.isArray(data.groupMembers) ? data.groupMembers : []),
      expensesJson: JSON.stringify(Array.isArray(data.expenses) ? data.expenses : []),
      historyJson: JSON.stringify(Array.isArray(data.history) ? data.history : []),
      settingsJson: JSON.stringify(data.settings || null),
      updatedAt: new Date().toISOString(),
    });
    if (!saved) return response.status(404).json({ error: "Rider account was not found." });
    response.json({ saved: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/riders/:id/photos", async (request, response, next) => {
  try {
    const photos = await repository.getRidePhotos(String(request.params.id), String(request.query.historyId || ""));
    response.json({ photos });
  } catch (error) {
    next(error);
  }
});

app.post("/api/riders/:id/photos", async (request, response, next) => {
  const dataUrl = String(request.body?.dataUrl || "");
  if (!dataUrl.startsWith("data:image/") || dataUrl.length > 3_500_000) {
    return response.status(400).json({ error: "Upload an image smaller than 2.5 MB." });
  }
  try {
    const photo = await repository.createRidePhoto({
      riderId: String(request.params.id),
      id: randomUUID(),
      historyId: String(request.body?.historyId || ""),
      name: String(request.body?.name || "ride-photo"),
      type: String(request.body?.type || "image/jpeg"),
      dataUrl,
      createdAt: new Date().toISOString(),
    });
    if (!photo) return response.status(404).json({ error: "Rider account was not found." });
    response.status(201).json({ photo });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/riders/:id/photos/:photoId", async (request, response, next) => {
  try {
    const deleted = await repository.deleteRidePhoto(String(request.params.id), String(request.params.photoId));
    if (!deleted) return response.status(404).json({ error: "Photo was not found." });
    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/routes", async (request, response, next) => {
  const { from, to, interests = [], maxHops = 6 } = request.body || {};
  if (!from || !to || from === to) {
    return response.status(400).json({
      code: "INVALID_ROUTE",
      error: "Choose two different places for your route.",
    });
  }
  if (!Array.isArray(interests) || interests.length === 0) {
    return response.status(400).json({
      code: "MISSING_INTERESTS",
      error: "Choose at least one interest so Rove can explain its recommendations.",
    });
  }
  try {
    const result = await repository.planRoute({
      from: String(from),
      to: String(to),
      interests: interests.slice(0, 8).map(String),
      maxHops: Math.max(2, Math.min(8, Number(maxHops) || 6)),
    });
    response.json({ ...result, mode: repository.mode });
  } catch (error) {
    next(error);
  }
});

app.get("/api/experiences/:id/related", async (request, response, next) => {
  try {
    response.json({
      related: await repository.related(String(request.params.id)),
      mode: repository.mode,
    });
  } catch (error) {
    next(error);
  }
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
app.use(express.static(dist));
app.get("/{*path}", (request, response, next) => {
  if (request.path.startsWith("/api/")) return next();
  response.sendFile(path.join(dist, "index.html"), (error) => error && next(error));
});

app.use((error, _request, response, _next) => {
  void _next;
  console.error("Request failed:", error.message);
  response.status(503).json({
    code: "DATABASE_UNAVAILABLE",
    error: "The travel graph is temporarily unreachable.",
    hint: "Check the CognoDB connection settings and try again.",
  });
});

const server = app.listen(config.port, () => {
  console.log(`Rove API listening on http://localhost:${config.port} (${repository.mode} mode)`);
});

const shutdown = async () => {
  server.close();
  await repository.close?.();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
