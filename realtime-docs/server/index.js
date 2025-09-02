// server/index.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const ShareDB = require("sharedb");
const richText = require("rich-text");
const WebSocket = require("ws");
const WebSocketJSONStream = require("@teamwork/websocket-json-stream");
const ShareDBMongo = require("sharedb-mongo");

const PORT = process.env.PORT || 4000;
const WS_PORT = process.env.WS_PORT || 8080;
const MONGO_URL =
  process.env.MONGO_URL || "mongodb://localhost:27017/realtime-docs";

// 1) Setup ShareDB with MongoDB adapter
ShareDB.types.register(richText.type);
const db = ShareDBMongo(MONGO_URL);
const backend = new ShareDB({ db });

// 2) Optional: Create/get a document helper
async function ensureDoc(collection, id, defaultText = "") {
  return new Promise((resolve, reject) => {
    const connection = backend.connect();
    const doc = connection.get(collection, id);
    doc.fetch((err) => {
      if (err) return reject(err);
      if (doc.type === null) {
        // New doc: create with empty string of rich-text type
        doc.create(defaultText, "rich-text", (createErr) => {
          if (createErr) return reject(createErr);
          resolve(doc);
        });
      } else {
        resolve(doc);
      }
    });
  });
}

// 3) REST API (for health + creating/listing minimal docs)
const app = express();
app.use(cors());
app.use(express.json());

/**
 * POST /documents
 * body: { title?: string, id?: string, initial?: string }
 * returns: { id }
 */
app.post("/documents", async (req, res) => {
  try {
    const id = req.body.id || uuidv4();
    const initial =
      typeof req.body.initial === "string" ? req.body.initial : "";
    await ensureDoc("documents", id, initial);
    res.json({ id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed_to_create_doc" });
  }
});

/**
 * GET /health
 */
app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`REST API listening on http://localhost:${PORT}`);
});

// 4) WebSocket server for ShareDB
const wss = new WebSocket.Server({ port: WS_PORT });
wss.on("connection", (ws) => {
  const stream = new WebSocketJSONStream(ws);
  backend.listen(stream);
});
console.log(`ShareDB WebSocket server on ws://localhost:${WS_PORT}`);

// 5) Create a default "demo" document at startup (handy!)
ensureDoc("documents", "demo", "Hello, collaborative world! ✨").catch(
  console.error
);
