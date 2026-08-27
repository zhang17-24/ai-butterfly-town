import type { IncomingMessage, Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { RealtimeMessage } from "@ai-town/shared";
import { WebSocket, WebSocketServer } from "ws";
import { parseCookieHeader, SESSION_COOKIE, verifySessionToken } from "../auth/session.js";
import type { TownRepository } from "../db/repository.js";

export class WorldHub {
  private server = new WebSocketServer({ noServer: true });
  private clients = new Map<string, Set<WebSocket>>();

  constructor(private repository: TownRepository, private cookieSecret: string) {}

  attach(httpServer: Server): void {
    httpServer.on("upgrade", (request, socket, head) => {
      void this.handleUpgrade(request, socket, head);
    });
  }

  broadcast(worldId: string, message: RealtimeMessage): void {
    const encoded = JSON.stringify(message);
    for (const client of this.clients.get(worldId) ?? []) {
      if (client.readyState === WebSocket.OPEN) client.send(encoded);
    }
  }

  close(): void {
    for (const clients of this.clients.values()) {
      for (const client of clients) client.close();
    }
    this.server.close();
  }

  private async handleUpgrade(request: IncomingMessage, socket: import("node:stream").Duplex, head: Buffer): Promise<void> {
    const url = new URL(request.url ?? "", "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    const cookies = parseCookieHeader(request.headers.cookie);
    const userId = verifySessionToken(cookies[SESSION_COOKIE], this.cookieSecret);
    const worldId = url.searchParams.get("worldId");
    if (!userId || !worldId || !this.repository.ownsWorld(userId, worldId)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    this.server.handleUpgrade(request, socket, head, (ws) => {
      this.addClient(worldId, ws);
      const state = this.repository.getWorldState(userId, worldId);
      if (!state) return;
      const afterVersionText = url.searchParams.get("afterVersion");
      const afterVersion = afterVersionText === null ? null : Number(afterVersionText);
      const canCatchUp = afterVersion !== null
        && Number.isInteger(afterVersion)
        && afterVersion >= 0
        && afterVersion <= state.world.version
        && state.world.version - afterVersion <= 100;
      const envelope = {
        eventId: randomUUID(),
        worldId,
        branchId: state.world.activeBranchId,
        version: state.world.version,
        emittedAt: new Date().toISOString(),
      };
      const message: RealtimeMessage = canCatchUp ? {
        ...envelope,
        type: "world.catchup",
        data: {
          fromVersion: afterVersion,
          state,
          events: this.repository.listEventsAfter(worldId, state.world.activeBranchId, afterVersion, 200),
        },
      } : { ...envelope, type: "world.snapshot", data: state };
      ws.send(JSON.stringify(message));
    });
  }

  private addClient(worldId: string, socket: WebSocket): void {
    const clients = this.clients.get(worldId) ?? new Set<WebSocket>();
    clients.add(socket);
    this.clients.set(worldId, clients);
    socket.on("close", () => {
      clients.delete(socket);
      if (clients.size === 0) this.clients.delete(worldId);
    });
  }
}
