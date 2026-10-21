import { NextRequest, NextResponse } from "next/server";
import { getSharedPvpRtdbEngine } from "@/lib/pvp/firebase-rtdb";
import {
  ensureFirebaseCloudHydrated,
  getFirebaseDatabaseUrl,
  writeFirebaseRtdbNode,
} from "@/lib/pvp/firebase-admin-sync";

export async function GET(request: NextRequest) {
  const engine = getSharedPvpRtdbEngine();
  await ensureFirebaseCloudHydrated(engine);
  const roomId = request.nextUrl.searchParams.get("roomId");
  if (roomId) {
    return NextResponse.json({ room: engine.getRoom(roomId) }, { status: 200 });
  }
  return NextResponse.json(
    {
      ...engine.getStatsPayload(),
      waitingRooms: engine.listWaitingRooms(),
      firebaseConnected: Boolean(getFirebaseDatabaseUrl()),
    },
    { status: 200 },
  );
}

export async function POST(request: NextRequest) {
  const engine = getSharedPvpRtdbEngine();
  await ensureFirebaseCloudHydrated(engine);
  try {
    const body = await request.json();
    const action = body?.action as string;

    switch (action) {
      case "createRoom": {
        const res = engine.createRoom({
          totalPot: Number(body.totalPot),
          building: body.building,
          seed: body.seed,
          host: body.host,
        });
        void writeFirebaseRtdbNode(`rooms/${res.room.roomId}`, res.room);
        void writeFirebaseRtdbNode("stats/global", engine.getSnapshot().stats.global);
        return NextResponse.json(res, { status: 200 });
      }
      case "joinRoom": {
        const res = engine.joinRoom(String(body.roomCodeOrId ?? ""), body.guest);
        void writeFirebaseRtdbNode(`rooms/${res.room.roomId}`, res.room);
        void writeFirebaseRtdbNode("stats/global", engine.getSnapshot().stats.global);
        return NextResponse.json(res, { status: 200 });
      }
      case "listWaitingRooms": {
        return NextResponse.json({ rooms: engine.listWaitingRooms() }, { status: 200 });
      }
      case "getRoom": {
        return NextResponse.json({ room: engine.getRoom(String(body.roomCodeOrId ?? "")) }, { status: 200 });
      }
      case "getStats": {
        return NextResponse.json(engine.getStatsPayload(), { status: 200 });
      }
      case "updateTotalPot": {
        const room = engine.updateTotalPot(String(body.roomId), Number(body.totalPot));
        void writeFirebaseRtdbNode(`rooms/${room.roomId}`, room);
        return NextResponse.json({ room }, { status: 200 });
      }
      case "updatePlayerEquipment": {
        const room = engine.updatePlayerEquipment(
          String(body.roomId),
          body.slot,
          body.equipment,
          Number(body.coins),
          body.activity,
        );
        void writeFirebaseRtdbNode(`rooms/${room.roomId}/players/${body.slot}`, room.players[body.slot as "p1" | "p2"]);
        return NextResponse.json({ room }, { status: 200 });
      }
      case "sendEmote": {
        const room = engine.sendEmote(String(body.roomId), body.slot, body.emote);
        void writeFirebaseRtdbNode(`rooms/${room.roomId}/players/${body.slot}/emote`, body.emote);
        return NextResponse.json({ room }, { status: 200 });
      }
      case "setReady": {
        const room = engine.setReady(String(body.roomId), body.slot, Boolean(body.ready), Number(body.coins));
        void writeFirebaseRtdbNode(`rooms/${room.roomId}`, room);
        void writeFirebaseRtdbNode("stats/global", engine.getSnapshot().stats.global);
        return NextResponse.json({ room }, { status: 200 });
      }
      case "pushDrop": {
        const room = engine.pushDrop(String(body.roomId), body.slot, body.drop, body.live);
        void writeFirebaseRtdbNode(`rooms/${room.roomId}/drops/${body.slot}/${body.drop?.sequence ?? 0}`, body.drop);
        void writeFirebaseRtdbNode(`rooms/${room.roomId}/live/${body.slot}`, body.live);
        return NextResponse.json({ room }, { status: 200 });
      }
      case "pushTelemetry": {
        const room = engine.pushTelemetry(String(body.roomId), body.slot, body.live);
        void writeFirebaseRtdbNode(`rooms/${room.roomId}/live/${body.slot}`, body.live);
        return NextResponse.json({ room }, { status: 200 });
      }
      case "finishOrResolve": {
        const roomId = String(body.roomId);
        const result = engine.finishOrResolve(
          roomId,
          body.slot,
          body.live,
          body.forfeitSlot,
        );
        const updatedRoom = engine.getRoom(roomId);
        if (updatedRoom) {
          void writeFirebaseRtdbNode(`rooms/${roomId}`, updatedRoom);
        }
        if (result) {
          void writeFirebaseRtdbNode("stats", engine.getSnapshot().stats);
        }
        return NextResponse.json({ result, room: updatedRoom }, { status: 200 });
      }
      default:
        return NextResponse.json({ error: `Unknown PvP action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PvP request failed" },
      { status: 400 },
    );
  }
}
