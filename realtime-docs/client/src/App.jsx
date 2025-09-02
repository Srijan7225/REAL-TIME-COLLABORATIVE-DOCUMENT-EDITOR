import { useEffect, useRef, useState } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";

import ReconnectingWebSocket from "reconnecting-websocket";
import ShareDB from "sharedb-client";
import richText from "rich-text";

// Register the rich-text OT type both client & server
ShareDB.types.register(richText.type);

const WS_URL = "ws://localhost:8080";
const DEFAULT_DOC_ID = "demo"; // you can pass ?id=your-id in the URL

export default function App() {
  const editorRef = useRef(null);
  const quillRef = useRef(null);
  const [status, setStatus] = useState("Connecting…");

  useEffect(() => {
    // Pick document ID from URL (?id=xyz) or fallback to "demo"
    const params = new URLSearchParams(window.location.search);
    const docId = params.get("id") || DEFAULT_DOC_ID;

    // 1) Setup Quill
    const quill = new Quill(editorRef.current, {
      theme: "snow",
      placeholder: "Start typing… this is collaborative!",
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link", "blockquote", "code-block"],
          [{ align: [] }],
          ["clean"],
        ],
      },
    });
    quillRef.current = quill;
    quill.disable();

    // 2) Connect to ShareDB server
    const socket = new ReconnectingWebSocket(WS_URL);
    const connection = new ShareDB.Connection(socket);

    socket.addEventListener("open", () => setStatus("Connected"));
    socket.addEventListener("close", () =>
      setStatus("Disconnected (retrying)…")
    );

    const doc = connection.get("documents", docId);

    doc.subscribe((err) => {
      if (err) {
        console.error(err);
        setStatus("Error loading document");
        return;
      }

      // If document is new, initialize with empty rich-text
      if (!doc.type) {
        doc.create("", "rich-text", (err2) => {
          if (err2) console.error("Create error:", err2);
        });
      }

      // Set editor contents to current doc data
      quill.setContents(doc.data);
      quill.enable();

      // 3) When the user types, submit operations to ShareDB
      quill.on("text-change", (delta, _oldDelta, source) => {
        if (source !== "user") return;
        doc.submitOp(delta, { source: quill });
      });

      // 4) When remote ops come in, update Quill (avoid echo)
      doc.on("op", (op, source) => {
        if (source === quill) return;
        quill.updateContents(op);
      });
    });

    return () => {
      quill.off("text-change");
      connection.close();
    };
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: "2rem auto", padding: "1rem" }}>
      <header
        style={{
          marginBottom: 12,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <h2>Realtime Docs — Local</h2>
        <div
          aria-live="polite"
          style={{
            fontSize: 14,
            padding: "4px 10px",
            borderRadius: 999,
            background: "#f1f5f9",
          }}
        >
          {status}
        </div>
      </header>
      <div ref={editorRef} style={{ background: "white", minHeight: 400 }} />
      <p style={{ marginTop: 8, color: "#475569", fontSize: 14 }}>
        Open this page in another tab/window to see live collaboration. Use{" "}
        <code>?id=some-id</code> to create or join a specific doc (e.g.{" "}
        <code>http://localhost:5173/?id=mydoc</code>).
      </p>
    </div>
  );
}
