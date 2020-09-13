import express from "express";
import type { Server } from "http";
import ws from "ws";

import { Doc, init } from "./doc";
import { patcher } from "./patcher";
import * as crypto from "crypto";

const clone = (o: unknown) => JSON.parse(JSON.stringify(o));

const id = (type: string) =>
  `${type}-${Math.round(Math.random() * 36 ** 5).toString(36)}`;

const app = express();
app.enable("strict routing");

const PORT = process.env.PORT || 8000;
const server = app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});

app.get("/health", (req, res) => {
  res.send("SKETCH HEALTHY");
});

app.use("/sketch", express.static("public"));

type Client = {
  id: string;
  socket: WebSocket;
  shadow: Doc;
};

let doc: Doc = init();

const clients: { [key: string]: Client } = {};

const update = () => {
  Object.values(clients).map((client) => {
    const delta = patcher.diff(client.shadow, doc);
    if (delta) {
      client.socket.send(JSON.stringify({ delta }));
      client.shadow = doc;
    }
  });
};

const wsServer = new ws.Server({
  // @ts-ignore
  server: app,
  path: "/sketch/ws",
  perMessageDeflate: true,
});
wsServer.on("connection", (socket) => {
  let currentClientId: string;
  do {
    currentClientId = id("c");
  } while (Object.keys(clients).indexOf(currentClientId) >= 0);

  clients[currentClientId] = {
    id: currentClientId,
    // @ts-ignore
    socket,
    shadow: doc,
  };

  socket.send(JSON.stringify({ init: doc, you: currentClientId }));

  socket.on("message", (message) => {
    const data = JSON.parse(message as string);
    const delta = data.delta;

    if (delta.length > 0) {
      try {
        const newShadow = patcher.patch(
          clients[currentClientId].shadow,
          delta
        ) as unknown;
        const newDoc = patcher.patch(doc, delta) as unknown;

        clients[currentClientId].shadow = newShadow as Doc;
        doc = newDoc as Doc;
      } catch (error) {
        console.error("ERROR", error);

        // Patch couldn't be applied for some reason.. resert and re-sync the client...
        clients[currentClientId].shadow = doc;
        socket.send(JSON.stringify({ init: doc, you: currentClientId }));
      }

      update();
    }
  });

  socket.on("close", function close() {
    delete doc.cursors[currentClientId];
    delete clients[currentClientId];

    update();
  });
});

server.on("upgrade", (request, socket, head) => {
  wsServer.handleUpgrade(request, socket, head, (socket) => {
    wsServer.emit("connection", socket, request);
  });
});
