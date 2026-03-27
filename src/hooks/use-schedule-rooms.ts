"use client";

import { useCallback, useState } from "react";
import {
  getDefaultScheduleRooms,
  loadScheduleRooms,
  saveScheduleRooms,
  type RoomConfig,
  type ScheduleRoomsConfig,
} from "@/lib/schedule-rooms";

function createRoomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `room-${crypto.randomUUID()}`;
  }
  return `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useScheduleRooms() {
  const [scheduleRooms, setScheduleRooms] = useState<ScheduleRoomsConfig>(() => loadScheduleRooms());

  const updateScheduleRooms = useCallback(
    (updater: (current: ScheduleRoomsConfig) => ScheduleRoomsConfig) => {
      setScheduleRooms((current) => {
        const next = updater(current);
        saveScheduleRooms(next);
        return next;
      });
    },
    [],
  );

  const addRoom = useCallback(
    (name: string, color: string) => {
      const nextName = name.trim();
      if (!nextName) {
        return { ok: false, reason: "Room name is required." as const };
      }

      let wasAdded = false;
      updateScheduleRooms((current) => {
        const exists = current.rooms.some(
          (entry) => entry.name.toLowerCase() === nextName.toLowerCase(),
        );
        if (exists) {
          return current;
        }
        wasAdded = true;
        return {
          ...current,
          rooms: [
            ...current.rooms,
            {
              id: createRoomId(),
              name: nextName,
              color,
              active: true,
            },
          ],
        };
      });

      if (!wasAdded) {
        return { ok: false, reason: "A room with that name already exists." as const };
      }
      return { ok: true as const };
    },
    [updateScheduleRooms],
  );

  const updateRoom = useCallback(
    (
      roomId: string,
      updates: Partial<{
        name: string;
        color: string;
        active: boolean;
      }>,
    ) => {
      updateScheduleRooms((current) => ({
        ...current,
        rooms: current.rooms.map((room) => {
          if (room.id !== roomId) {
            return room;
          }
          const nextNameRaw = updates.name !== undefined ? updates.name.trim() : room.name;
          const nextName = nextNameRaw || room.name;
          const duplicate = current.rooms.some(
            (candidate) =>
              candidate.id !== roomId && candidate.name.toLowerCase() === nextName.toLowerCase(),
          );
          return {
            ...room,
            ...(duplicate ? {} : { name: nextName }),
            ...(updates.color !== undefined ? { color: updates.color } : {}),
            ...(updates.active !== undefined ? { active: updates.active } : {}),
          };
        }),
      }));
    },
    [updateScheduleRooms],
  );

  const removeRoom = useCallback(
    (roomId: string) => {
      updateScheduleRooms((current) => ({
        ...current,
        rooms: current.rooms.filter((room) => room.id !== roomId),
      }));
    },
    [updateScheduleRooms],
  );

  const setEnableRoomSelectionOnCheckIn = useCallback(
    (enabled: boolean) => {
      updateScheduleRooms((current) => ({
        ...current,
        enableRoomSelectionOnCheckIn: enabled,
      }));
    },
    [updateScheduleRooms],
  );

  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultScheduleRooms();
    setScheduleRooms(defaults);
    saveScheduleRooms(defaults);
  }, []);

  return {
    scheduleRooms,
    rooms: scheduleRooms.rooms,
    addRoom,
    updateRoom,
    removeRoom,
    setEnableRoomSelectionOnCheckIn,
    resetToDefaults,
  };
}

export type { RoomConfig };

