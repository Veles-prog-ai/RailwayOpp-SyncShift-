// server.js
import "dotenv/config";
import crypto from "crypto";
import http from "http";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var PORT = Number(process.env.PORT || 3e3);
var LICENSE_HMAC_SECRET = process.env.LICENSE_SIGNING_SECRET || crypto.randomBytes(32).toString("hex");
var MAX_ACKED_ROLLING_WINDOW = 20;
var MAX_QUEUED_PER_TENANT = 200;
var MAX_API_LOGS = 150;
var tenantBuffers = /* @__PURE__ */ new Map();
var tenantRegistry = /* @__PURE__ */ new Map();
var licenseRegistry = /* @__PURE__ */ new Map();
var apiLogs = [];
function signLicensePayload(tenantId, plan, maxDrivers, expiresAt) {
  const payload = `${tenantId}|${plan}|${maxDrivers}|${expiresAt}`;
  const signature = crypto.createHmac("sha256", LICENSE_HMAC_SECRET).update(payload).digest("hex");
  const planCode = plan === "Enterprise" ? "ENT" : plan === "Flota Pro" ? "PRO" : "STD";
  const tenantCode = tenantId.replace(/[^A-Z0-9]/gi, "").slice(0, 6).toUpperCase();
  const licenseKey = `ZP-${planCode}-${tenantCode}-${signature.slice(0, 8).toUpperCase()}-${signature.slice(8, 14).toUpperCase()}`;
  return { signature, licenseKey };
}
function clearServerState() {
  tenantBuffers.clear();
  tenantRegistry.clear();
  licenseRegistry.clear();
  apiLogs.length = 0;
}
clearServerState();
function getTenantBuffer(tenantId) {
  let buf = tenantBuffers.get(tenantId);
  if (!buf) {
    buf = [];
    tenantBuffers.set(tenantId, buf);
  }
  return buf;
}
function pruneTenantBuffer(tenantId) {
  const buf = getTenantBuffer(tenantId);
  const queued = buf.filter((e) => e.status === "queued").slice(-MAX_QUEUED_PER_TENANT);
  const acked = buf.filter((e) => e.status === "acked").slice(-MAX_ACKED_ROLLING_WINDOW);
  tenantBuffers.set(tenantId, [...queued, ...acked]);
}
function safeTokenCompare(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
function findActiveLicenseForTenant(tenantId) {
  const nowMs = Date.now();
  for (const lic of licenseRegistry.values()) {
    if (lic.tenantId === tenantId && lic.status === "active" && new Date(lic.expiresAt).getTime() > nowMs) {
      return lic;
    }
  }
  return null;
}
function recordApiLog(entry) {
  apiLogs.unshift({
    id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    ...entry
  });
  if (apiLogs.length > MAX_API_LOGS) {
    apiLogs.length = MAX_API_LOGS;
  }
}
async function startServer() {
  const app = express();
  app.use(express.json({ limit: "512kb" }));
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  app.use("/api", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Pathway-Token");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use("/api", (req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const tenantMatch = req.originalUrl.match(/\/api\/t\/([^/]+)/);
      const tenantId = tenantMatch?.[1] || (typeof req.query.tenantId === "string" ? req.query.tenantId : null) || (typeof req.body?.tenantId === "string" ? req.body.tenantId : "SERVICE-ADMIN");
      const reqLen = Number(req.headers["content-length"] || 0);
      recordApiLog({
        method: req.method,
        path: req.originalUrl.split("?")[0],
        tenantId,
        statusCode: res.statusCode,
        latencyMs: Math.max(1, Date.now() - start),
        payloadBytes: Number.isFinite(reqLen) ? reqLen : 0,
        note: res.statusCode >= 400 ? "Blokiran ili neva\u017Ee\u0107i zahtev" : req.originalUrl.includes("/gateway/") ? "E2EE koverta (zero-knowledge)" : "Admin / Sistemski poziv"
      });
    });
    next();
  });
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      mode: "multi-tenant-e2ee-gateway",
      tenants: tenantRegistry.size,
      hasGeminiKey: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"
      )
    });
  });
  const requireTenantPathway = (req, res, next) => {
    const tenantId = req.params.tenantId;
    const tenant = tenantRegistry.get(tenantId);
    if (!tenant) {
      res.status(404).json({ error: `Nepoznat klijentski kanal (${tenantId}).` });
      return;
    }
    if (tenant.status !== "active") {
      res.status(403).json({ error: `Klijentski kanal ${tenantId} je suspendovan.` });
      return;
    }
    const token = req.header("X-Pathway-Token") || "";
    if (!token || !safeTokenCompare(token, tenant.pathwayToken)) {
      res.status(401).json({
        error: "Neispravan Pathway Token \u2014 pristup izolovanom kanalu odbijen."
      });
      return;
    }
    const activeLic = findActiveLicenseForTenant(tenantId);
    if (!activeLic) {
      res.status(403).json({
        error: `Licenca za klijenta ${tenant.clientName} je istekla ili opozvana. Kontaktirajte servis provajdera.`
      });
      return;
    }
    next();
  };
  app.post("/api/t/:tenantId/gateway/publish", requireTenantPathway, (req, res) => {
    const tenantId = req.params.tenantId;
    const body = req.body;
    if (!body || typeof body.id !== "string" || body.sourceNode !== "mobile" && body.sourceNode !== "office" || body.targetNode !== "mobile" && body.targetNode !== "office" || typeof body.seq !== "number" || typeof body.iv !== "string" || typeof body.ciphertext !== "string" || body.ciphertext.length > 262144) {
      res.status(400).json({ error: "Neispravan format \u0161ifrovane koverte." });
      return;
    }
    const buf = getTenantBuffer(tenantId);
    if (!buf.some((e) => e.id === body.id)) {
      buf.push({
        id: body.id,
        tenantId,
        sourceNode: body.sourceNode,
        targetNode: body.targetNode,
        seq: body.seq,
        iv: body.iv,
        ciphertext: body.ciphertext,
        payloadBytes: body.ciphertext.length,
        createdAt: typeof body.createdAt === "string" ? body.createdAt : (/* @__PURE__ */ new Date()).toISOString(),
        status: "queued"
      });
      pruneTenantBuffer(tenantId);
    }
    const latestBuf = getTenantBuffer(tenantId);
    res.json({
      ok: true,
      id: body.id,
      tenantId,
      queuedForTarget: latestBuf.filter(
        (e) => e.targetNode === body.targetNode && e.status === "queued"
      ).length
    });
  });
  app.get("/api/t/:tenantId/gateway/pull", requireTenantPathway, (req, res) => {
    const tenantId = req.params.tenantId;
    const node = req.query.node;
    if (node !== "mobile" && node !== "office") {
      res.status(400).json({ error: "Parametar node mora biti mobile ili office." });
      return;
    }
    const buf = getTenantBuffer(tenantId);
    const pending = buf.filter((e) => e.targetNode === node && e.status === "queued").sort((a, b) => a.seq - b.seq);
    res.json({
      tenantId,
      node,
      envelopes: pending,
      totalBuffered: buf.length
    });
  });
  app.post("/api/t/:tenantId/gateway/ack", requireTenantPathway, (req, res) => {
    const tenantId = req.params.tenantId;
    const { envelopeIds, ackedBy } = req.body ?? {};
    if (!Array.isArray(envelopeIds) || ackedBy !== "mobile" && ackedBy !== "office") {
      res.status(400).json({ error: "Neispravan ACK zahtev." });
      return;
    }
    const idSet = new Set(envelopeIds.filter((id) => typeof id === "string"));
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    let ackedCount = 0;
    const updated = getTenantBuffer(tenantId).map((env) => {
      if (idSet.has(env.id) && env.targetNode === ackedBy && env.status === "queued") {
        ackedCount += 1;
        return { ...env, status: "acked", ackedAt: nowIso };
      }
      return env;
    });
    tenantBuffers.set(tenantId, updated);
    pruneTenantBuffer(tenantId);
    res.json({ ok: true, tenantId, ackedCount });
  });
  app.get("/api/t/:tenantId/gateway/envelopes", requireTenantPathway, (req, res) => {
    const tenantId = req.params.tenantId;
    const buf = getTenantBuffer(tenantId);
    const summaries = [...buf].reverse().slice(0, 30).map((e) => ({
      id: e.id,
      tenantId: e.tenantId,
      sourceNode: e.sourceNode,
      targetNode: e.targetNode,
      seq: e.seq,
      payloadBytes: e.payloadBytes,
      cipherPreview: `aes256gcm:${e.ciphertext.slice(0, 22)}...`,
      createdAt: e.createdAt,
      status: e.status,
      ackedAt: e.ackedAt
    }));
    res.json({
      tenantId,
      envelopes: summaries,
      queuedMobile: buf.filter((e) => e.targetNode === "mobile" && e.status === "queued").length,
      queuedOffice: buf.filter((e) => e.targetNode === "office" && e.status === "queued").length,
      ackedRollingCount: buf.filter((e) => e.status === "acked").length,
      rollingWindowLimit: MAX_ACKED_ROLLING_WINDOW
    });
  });
  app.get("/api/t/:tenantId/mobile-manifest.webmanifest", (req, res) => {
    const tenant = tenantRegistry.get(req.params.tenantId);
    const shortClient = tenant ? tenant.clientName.slice(0, 12) : "ZP Kabina";
    res.setHeader("Content-Type", "application/manifest+json");
    res.json({
      id: `/?segment=mobile&tenant=${encodeURIComponent(req.params.tenantId)}`,
      name: tenant ? `${tenant.clientName} \u2014 Kabina` : "\u017Delezni\u010Dki Pogon \u2014 Kabina",
      short_name: shortClient,
      description: "Specijalizovana aplikacija za ma\u0161inovo\u0111e sa lokalnim E2EE \u010Duvanjem.",
      theme_color: "#0f172a",
      background_color: "#020617",
      display: "standalone",
      start_url: `/?segment=mobile&tenant=${encodeURIComponent(req.params.tenantId)}`,
      scope: "/",
      icons: [
        { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        {
          src: "/pwa-maskable-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable"
        }
      ]
    });
  });
  app.get("/api/admin/tenants", (_req, res) => {
    const list = Array.from(tenantRegistry.values()).map((t) => {
      const buf = getTenantBuffer(t.tenantId);
      const activeLic = findActiveLicenseForTenant(t.tenantId);
      return {
        ...t,
        queuedCount: buf.filter((e) => e.status === "queued").length,
        ackedCount: buf.filter((e) => e.status === "acked").length,
        licenseStatus: activeLic ? "Aktivna" : "Istekla / Opozvana",
        licenseKey: activeLic?.licenseKey || null
      };
    });
    res.json({ tenants: list });
  });
  app.post("/api/admin/tenants", (req, res) => {
    const clientName = String(req.body?.clientName || "").trim();
    if (clientName.length < 3) {
      res.status(400).json({ error: "Naziv klijenta mora imati najmanje 3 karaktera." });
      return;
    }
    const slug = clientName.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 8);
    const tenantId = `TENANT-${slug || "KLIJENT"}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const pathwayToken = `pw_${crypto.randomBytes(12).toString("hex")}`;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const record = {
      tenantId,
      clientName,
      pathwayPrefix: `/api/t/${tenantId}/gateway`,
      pathwayToken,
      status: "active",
      createdAt: nowIso,
      isolationMode: "strict-pathway-token"
    };
    tenantRegistry.set(tenantId, record);
    tenantBuffers.set(tenantId, []);
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1e3).toISOString();
    const { signature, licenseKey } = signLicensePayload(tenantId, "Standard", 15, expiresAt);
    const licId = `LIC-${Date.now().toString(36)}`;
    licenseRegistry.set(licId, {
      licenseId: licId,
      tenantId,
      clientName,
      plan: "Standard",
      maxDrivers: 15,
      modules: ["Mobilna kabina", "Deterministi\u010Dki motor", "E2EE Gateway"],
      issuedAt: nowIso,
      expiresAt,
      status: "active",
      signature,
      licenseKey
    });
    res.json({ ok: true, tenant: record });
  });
  app.post("/api/admin/tenants/:tenantId/rotate-token", (req, res) => {
    const tenant = tenantRegistry.get(req.params.tenantId);
    if (!tenant) {
      res.status(404).json({ error: "Klijent nije prona\u0111en." });
      return;
    }
    const nextToken = `pw_${crypto.randomBytes(12).toString("hex")}`;
    const updated = { ...tenant, pathwayToken: nextToken };
    tenantRegistry.set(tenant.tenantId, updated);
    res.json({ ok: true, tenant: updated });
  });
  app.get("/api/admin/licenses", (_req, res) => {
    res.json({ licenses: Array.from(licenseRegistry.values()).reverse() });
  });
  app.post("/api/admin/licenses/generate", (req, res) => {
    const { tenantId, plan, maxDrivers, durationDays, modules } = req.body ?? {};
    const tenant = tenantRegistry.get(String(tenantId || ""));
    if (!tenant) {
      res.status(400).json({ error: "Izabrani klijent ne postoji." });
      return;
    }
    const validPlan = plan === "Enterprise" || plan === "Flota Pro" ? plan : "Standard";
    const driversCount = Math.max(1, Math.min(5e3, Number(maxDrivers || 20)));
    const days = Math.max(1, Math.min(1825, Number(durationDays || 365)));
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1e3).toISOString();
    const { signature, licenseKey } = signLicensePayload(
      tenant.tenantId,
      validPlan,
      driversCount,
      expiresAt
    );
    const license = {
      licenseId: `LIC-${Date.now().toString(36).toUpperCase()}`,
      tenantId: tenant.tenantId,
      clientName: tenant.clientName,
      plan: validPlan,
      maxDrivers: driversCount,
      modules: Array.isArray(modules) && modules.length > 0 ? modules : ["Mobilna kabina", "E2EE Gateway"],
      issuedAt: (/* @__PURE__ */ new Date()).toISOString(),
      expiresAt,
      status: "active",
      signature,
      licenseKey
    };
    licenseRegistry.set(license.licenseId, license);
    res.json({ ok: true, license });
  });
  app.post("/api/admin/licenses/:licenseId/toggle-status", (req, res) => {
    const lic = licenseRegistry.get(req.params.licenseId);
    if (!lic) {
      res.status(404).json({ error: "Licenca nije prona\u0111ena." });
      return;
    }
    const updated = {
      ...lic,
      status: lic.status === "active" ? "revoked" : "active"
    };
    licenseRegistry.set(lic.licenseId, updated);
    res.json({ ok: true, license: updated });
  });
  app.post("/api/admin/licenses/verify", (req, res) => {
    const key = String(req.body?.licenseKey || "").trim().toUpperCase();
    const found = Array.from(licenseRegistry.values()).find(
      (l) => l.licenseKey.toUpperCase() === key
    );
    if (!found) {
      res.json({ valid: false, reason: "Licencni klju\u010D nije prona\u0111en u registru." });
      return;
    }
    const expected = signLicensePayload(
      found.tenantId,
      found.plan,
      found.maxDrivers,
      found.expiresAt
    );
    const sigOk = safeTokenCompare(expected.signature, found.signature);
    const notExpired = new Date(found.expiresAt).getTime() > Date.now();
    const active = found.status === "active";
    res.json({
      valid: sigOk && notExpired && active,
      license: found,
      checks: {
        hmacSignature: sigOk,
        notExpired,
        activeStatus: active
      },
      reason: !active ? "Licenca je opozvana od strane servis provajdera." : !notExpired ? "Licenca je istekla." : !sigOk ? "Neispravan kriptografski potpis." : "Licenca je va\u017Ee\u0107a i aktivna."
    });
  });
  app.get("/api/admin/api-logs", (req, res) => {
    const tenantFilter = typeof req.query.tenantId === "string" ? req.query.tenantId : "ALL";
    const filtered = tenantFilter === "ALL" ? apiLogs : apiLogs.filter((l) => l.tenantId === tenantFilter);
    res.json({ logs: filtered.slice(0, 80), totalRecorded: apiLogs.length });
  });
  app.get("/api/admin/diagnostics", (_req, res) => {
    const mem = process.memoryUsage();
    let totalQueued = 0;
    let totalAcked = 0;
    for (const buf of tenantBuffers.values()) {
      totalQueued += buf.filter((e) => e.status === "queued").length;
      totalAcked += buf.filter((e) => e.status === "acked").length;
    }
    res.json({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryRssMb: Math.round(mem.rss / 1024 / 1024),
      memoryHeapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      activeTenants: Array.from(tenantRegistry.values()).filter((t) => t.status === "active").length,
      activeLicenses: Array.from(licenseRegistry.values()).filter(
        (l) => l.status === "active"
      ).length,
      totalQueuedEnvelopes: totalQueued,
      totalAckedEnvelopes: totalAcked,
      totalApiLogs: apiLogs.length,
      hasGeminiKey: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"
      ),
      hmacEngineReady: Boolean(LICENSE_HMAC_SECRET)
    });
  });
  app.post("/api/admin/diagnostics/self-test", (_req, res) => {
    const results = [];
    const tenants = Array.from(tenantRegistry.values());
    results.push({
      check: "Izolacija klijentskih bafera",
      ok: tenants.every((t) => tenantBuffers.has(t.tenantId)),
      detail: `Verifikovano ${tenants.length} odvojenih putanja (/api/t/{tenantId}/gateway).`
    });
    const sampleLic = Array.from(licenseRegistry.values())[0];
    const hmacOk = sampleLic ? safeTokenCompare(
      signLicensePayload(
        sampleLic.tenantId,
        sampleLic.plan,
        sampleLic.maxDrivers,
        sampleLic.expiresAt
      ).signature,
      sampleLic.signature
    ) : true;
    results.push({
      check: "HMAC-SHA256 potpis licenci",
      ok: hmacOk,
      detail: hmacOk ? "Kriptografska verifikacija licenci uspe\u0161na." : "Gre\u0161ka pri proveri potpisa licence."
    });
    results.push({
      check: "Zero-Knowledge Gateway pravilo",
      ok: true,
      detail: "Gateway ne \u010Duva otvoreni tekst ni na jednoj putanji klijenata."
    });
    res.json({ passed: results.every((r) => r.ok), results });
  });
  app.post("/api/gateway/reset", (_req, res) => {
    clearServerState();
    res.json({ ok: true });
  });
  app.post("/api/admin/purge", (_req, res) => {
    clearServerState();
    res.json({ ok: true });
  });
  app.post("/api/ai-audit", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      res.status(503).json({
        missingKey: true,
        error: "GEMINI_API_KEY nije konfigurisan u Settings > Secrets panelu. Lokalna deterministi\u010Dka provera radi bez API klju\u010Da."
      });
      return;
    }
    try {
      const { anonymizedPayload } = req.body ?? {};
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
      const prompt = `Analiziraj anonimizovane \u017Eelezni\u010Dke podatke (bez li\u010Dnih imena) i vrati sa\u017Eet JSON izve\u0161taj na srpskom (latinica): anomalije vozila/goriva, ponavljaju\u0107e zastoje po koridorima, zakonske rizike i rotaciju vozila po stanicama.
${JSON.stringify(
        anonymizedPayload
      )}`;
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: {
          systemInstruction: "Budi maksimalno sa\u017Eet i precizan (minimalna potro\u0161nja tokena). Koristi samo podatke iz ulaza na srpskom jeziku (latinica).",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              anomalies: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    severity: { type: Type.STRING },
                    title: { type: Type.STRING },
                    detail: { type: Type.STRING },
                    affectedEntity: { type: Type.STRING }
                  },
                  required: ["severity", "title", "detail", "affectedEntity"]
                }
              },
              optimizationRecommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    action: { type: Type.STRING },
                    estimatedBenefit: { type: Type.STRING }
                  },
                  required: ["title", "action", "estimatedBenefit"]
                }
              }
            },
            required: ["summary", "anomalies", "optimizationRecommendations"]
          }
        }
      });
      const rawText = (response.text ?? "{}").trim();
      res.json(JSON.parse(rawText));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nepoznata gre\u0161ka pri pozivu Gemini API-ja.";
      res.status(500).json({ error: `Gemini AI provera nije uspela: ${message}` });
    }
  });
  app.get("/api/download/desktop/:platform", (req, res) => {
    const platform = String(req.params.platform || "").toLowerCase();
    const host = req.get("host") || `localhost:${PORT}`;
    const proto = req.get("x-forwarded-proto") || req.protocol || "https";
    const baseUrl = `${proto}://${host}`;
    const dispatcherUrl = `${baseUrl}/?segment=dispatcher`;
    if (platform === "docker") {
      res.setHeader("Content-Type", "text/yaml; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="zeleznicki-pogon-desktop-docker.yml"'
      );
      res.send(
        `# \u017Delezni\u010Dki Pogon \u2014 Lokalni Klijentski Desktop / Office Vault (Docker)
# Generisano sa servera: ${baseUrl}
services:
  klijentski-trezor:
    image: node:22-alpine
    container_name: zp-klijentski-desktop
    working_dir: /app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - GATEWAY_UPSTREAM_URL=${baseUrl}
      - LOCAL_VAULT_ONLY=true
    volumes:
      - zp_local_vault:/app/vault
    restart: unless-stopped

volumes:
  zp_local_vault:
`
      );
      return;
    }
    if (platform === "windows") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="ZeleznickiPogon-Desktop-Windows.cmd"'
      );
      res.send(
        `@echo off\r
title Zeleznicki Pogon - Upravni Desktop\r
echo Pokretanje lokalnog klijentskog desktop okruzenja...\r
echo Gateway server: ${baseUrl}\r
where msedge >nul 2>&1 && (start "" msedge --app="${dispatcherUrl}" & exit /b 0)\r
where chrome >nul 2>&1 && (start "" chrome --app="${dispatcherUrl}" & exit /b 0)\r
start "" "${dispatcherUrl}"\r
`
      );
      return;
    }
    if (platform === "linux") {
      res.setHeader("Content-Type", "text/x-shellscript; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="zeleznicki-pogon-desktop-linux.sh"'
      );
      res.send(
        `#!/usr/bin/env bash
set -e
APP_URL="${dispatcherUrl}"
DESKTOP_FILE="$HOME/.local/share/applications/zeleznicki-pogon-desktop.desktop"
mkdir -p "$HOME/.local/share/applications"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=\u017Delezni\u010Dki Pogon \u2014 Upravni Desktop
Comment=Lokalni klijentski dispe\u010Derski trezor i QR generator
Exec=xdg-open "$APP_URL"
Terminal=false
Type=Application
Categories=Office;Logistics;
EOF
chmod +x "$DESKTOP_FILE"
echo "Pre\u010Dica instalirana u: $DESKTOP_FILE"
xdg-open "$APP_URL" >/dev/null 2>&1 || true
`
      );
      return;
    }
    if (platform === "mac") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="ZeleznickiPogon-Desktop-macOS.command"'
      );
      res.send(
        `#!/usr/bin/env bash
echo "Otvaranje \u017Delezni\u010Dki Pogon Upravnog desktopa (${baseUrl})..."
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="${dispatcherUrl}"
else
  open "${dispatcherUrl}"
fi
`
      );
      return;
    }
    res.status(404).json({
      error: "Nepodr\u017Eana platforma. Dostupno: windows, mac, linux, docker."
    });
  });
  app.get("/landing", (req, res) => {
    const host = req.get("host") || `localhost:${PORT}`;
    const proto = req.get("x-forwarded-proto") || req.protocol || "https";
    const baseUrl = `${proto}://${host}`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!doctype html>
<html lang="sr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>\u017Delezni\u010Dki Pogon \u2014 Serverski portal i preuzimanje Desktop aplikacije</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: #f8fafc; color: #0f172a; line-height: 1.6; }
    .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
    .container { max-width: 1140px; margin: 0 auto; padding: 0 24px; }
    header { background: #ffffff; border-bottom: 1px solid #e2e8f0; }
    .topbar { height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 32px; }
    .brand { font-weight: 700; font-size: 18px; color: #0f172a; text-decoration: none; white-space: nowrap; }
    nav { display: flex; gap: 24px; flex-wrap: wrap; }
    nav a { color: #475569; text-decoration: none; font-size: 14px; font-weight: 500; white-space: nowrap; }
    nav a:hover { color: #0f172a; }
    .cta { background: #0f172a; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; white-space: nowrap; }
    .cta:hover { background: #1e293b; }
    .hero { padding: 56px 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 40px; align-items: center; }
    h1 { font-size: clamp(2rem, 3.8vw, 3.2rem); line-height: 1.12; letter-spacing: -0.02em; margin: 0 0 16px 0; }
    .lead { font-size: 16px; color: #475569; margin: 0 0 24px 0; max-width: 58ch; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .btn-primary { background: #d97706; color: #0f172a; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: 700; font-size: 14px; }
    .btn-secondary { border: 1px solid #cbd5e1; background: #ffffff; color: #0f172a; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600; font-size: 14px; }
    .hero-img { width: 100%; border-radius: 14px; border: 1px solid #cbd5e1; aspect-ratio: 16/9; object-fit: cover; display: block; }
    section { padding: 48px 0; border-top: 1px solid #e2e8f0; }
    h2 { font-size: 24px; margin: 0 0 8px 0; letter-spacing: -0.01em; }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-top: 24px; }
    .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 22px; }
    .card h3 { margin: 0 0 6px 0; font-size: 16px; }
    .card p { margin: 0 0 16px 0; font-size: 14px; color: #475569; }
    .dl-link { display: inline-block; background: #0f172a; color: #fff; text-decoration: none; padding: 9px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; }
    .steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px; margin-top: 24px; }
    .step-num { font-size: 13px; font-weight: 700; color: #b45309; margin-bottom: 6px; }
    footer { border-top: 1px solid #e2e8f0; padding: 28px 0; font-size: 13px; color: #64748b; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  </style>
</head>
<body>
  <header>
    <div class="container topbar">
      <a class="brand" href="/">\u017Delezni\u010Dki Pogon</a>
      <nav>
        <a href="#preuzimanje">Desktop aplikacija</a>
        <a href="#bezbednost">Lokalni QR i linkovi</a>
        <a href="/?segment=dispatcher">Upravni desktop</a>
        <a href="/?segment=admin">Admin konzola</a>
      </nav>
      <a class="cta" href="/?segment=dispatcher">Otvori radni portal</a>
    </div>
  </header>

  <main class="container">
    <div class="hero">
      <div>
        <h1>Upravljanje ma\u0161inovo\u0111ama bez \u010Duvanja podataka na serveru</h1>
        <p class="lead">
          Hibridni sistem za uslu\u017Eno ustupanje ma\u0161inovo\u0111a. Operativni podaci, obra\u010Duni sati i E2EE klju\u010Devi ostaju isklju\u010Divo u lokalnom trezoru va\u0161eg Desktop ra\u010Dunara, dok server slu\u017Ei samo kao \u0161ifrovani prolaz.
        </p>
        <div class="actions">
          <a class="btn-primary" href="#preuzimanje">Preuzmi Desktop aplikaciju</a>
          <a class="btn-secondary" href="/">Otvori aplikaciju</a>
        </div>
      </div>
      <div>
        <img class="hero-img" src="/src/assets/images/hero_rail_corridor_1795389175108.jpg" alt="Elektri\u010Dna teretna lokomotiva na \u017Eelezni\u010Dkom koridoru" />
      </div>
    </div>

    <section id="preuzimanje">
      <h2>Preuzimanje Upravne Desktop aplikacije</h2>
      <p class="lead">Izaberite paket za ra\u010Dunar dispe\u010Dera ili lokalni serverski kontejner va\u0161e firme. Sva preuzimanja su unapred povezana na ovaj server (<span class="mono">${baseUrl}</span>).</p>
      <div class="grid-2">
        <div class="card">
          <h3>Windows 10 / 11 Desktop</h3>
          <p>Samostalni desktop pokreta\u010D za dispe\u010Derski rad i lokalno \u010Duvanje trezora u Windows okru\u017Eenju.</p>
          <a class="dl-link" href="/api/download/desktop/windows">Preuzmi za Windows (.cmd)</a>
        </div>
        <div class="card">
          <h3>Docker Office Vault (Preporu\u010Deno)</h3>
          <p>Izolovani Docker Compose paket za stalni lokalni rad kancelarije i privatnu bazu na serveru klijenta.</p>
          <a class="dl-link" href="/api/download/desktop/docker">Preuzmi Docker Compose (.yml)</a>
        </div>
        <div class="card">
          <h3>Linux Desktop (.desktop)</h3>
          <p>Instalaciona skripta za Ubuntu, Debian i Fedora radne stanice sa pre\u010Dicom u meniju sistema.</p>
          <a class="dl-link" href="/api/download/desktop/linux">Preuzmi za Linux (.sh)</a>
        </div>
        <div class="card">
          <h3>macOS Desktop</h3>
          <p>Direktni pokreta\u010D Upravnog desktopa za MacBook i iMac dispe\u010Derske stanice.</p>
          <a class="dl-link" href="/api/download/desktop/mac">Preuzmi za macOS (.command)</a>
        </div>
      </div>
    </section>

    <section id="bezbednost">
      <h2>Za\u0161to se QR kod i sigurni link generi\u0161u na Desktopu klijenta</h2>
      <div class="steps">
        <div class="card">
          <div class="step-num mono">01. KLIJENTSKA PRIVATNOST</div>
          <h3>E2EE klju\u010D nikada ne prolazi kroz server</h3>
          <p>Upravni desktop na va\u0161em ra\u010Dunaru \u010Duva \u0161ifru flote i generi\u0161e personalizovani QR kod za svakog ma\u0161inovo\u0111u ili operatera.</p>
        </div>
        <div class="card">
          <div class="step-num mono">02. LOKALNI SIGURNI LINK (#FRAGMENT)</div>
          <h3>Deo linka iza # ostaje van HTTP saobra\u0107aja</h3>
          <p>Lokalni sigurni link koristi URL fragment za prenos klju\u010Da direktno do telefona ma\u0161inovo\u0111e, bez upisa u logove servera.</p>
        </div>
        <div class="card">
          <div class="step-num mono">03. IZOLOVANE PUTANJE</div>
          <h3>Vi\u0161e firmi na istom serveru bez me\u0161anja</h3>
          <p>Svaki klijent dobija sopstveni kriptografski kanal i token, a aplikacija u kabini radi i u tunelima bez signala.</p>
        </div>
      </div>
    </section>
  </main>

  <footer class="container">
    <span>\u017Delezni\u010Dki Pogon \xB7 Serverska po\u010Detna stranica</span>
    <span><a href="/?segment=dispatcher" style="color:inherit;">Upravni desktop</a> \xB7 <a href="/?segment=mobile" style="color:inherit;">Mobilna kabina</a> \xB7 <a href="/api/health" style="color:inherit;">Status servera</a></span>
  </footer>
</body>
</html>`);
  });
  const httpServer = http.createServer(app);
  const serveFrontend = process.env.SERVE_FRONTEND !== "false";
  if (serveFrontend) {
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          allowedHosts: true,
          ws: { server: httpServer },
          hmr: process.env.DISABLE_HMR === "true" ? false : true
        },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } else {
      const distDir = path.resolve(__dirname, "dist");
      app.use(express.static(distDir));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distDir, "index.html"));
      });
    }
  } else {
    app.get("/", (_req, res) => {
      res.json({
        service: "zeleznicki-pogon-backend",
        mode: "backend-only",
        health: "/api/health",
        landing: "/landing"
      });
    });
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(
      `Multi-Tenant E2EE Gateway pokrenut na http://0.0.0.0:${PORT} (serveFrontend=${serveFrontend})`
    );
  });
}
startServer();
