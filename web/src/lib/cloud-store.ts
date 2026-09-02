import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  name: string;
  avatarUrl?: string;
  createdAt: number;
  library: any[];
}

export interface StoredRoom {
  roomCode: string;
  name: string;
  mediaUrl: string;
  mediaType: string;
  activeUsersCount: number;
  members: string[];
  createdAt: number;
  lastActive: number;
}

interface CloudDbSchema {
  users: Record<string, StoredUser>;
  rooms: Record<string, StoredRoom>;
}

const DB_FILE = path.join(process.cwd(), ".cloud-store.json");

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function loadDb(): CloudDbSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch {}
  return { users: {}, rooms: {} };
}

function saveDb(db: CloudDbSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not save cloud store to disk:", err);
  }
}

// In-memory cache for fast reads
let memoryDb: CloudDbSchema = loadDb();

export const CloudStore = {
  register(email: string, pass: string, name: string, avatarUrl?: string): StoredUser {
    memoryDb = loadDb();
    const normalizedEmail = email.trim().toLowerCase();
    
    // Check if email already registered
    const existing = Object.values(memoryDb.users).find(
      (u) => u.email.toLowerCase() === normalizedEmail
    );
    if (existing) {
      throw new Error("An account with this email already exists. Please log in.");
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(pass, salt);
    const userId = "usr_" + crypto.randomBytes(8).toString("hex");

    const newUser: StoredUser = {
      id: userId,
      email: normalizedEmail,
      passwordHash,
      salt,
      name: name.trim() || normalizedEmail.split("@")[0],
      avatarUrl: avatarUrl?.trim() || undefined,
      createdAt: Date.now(),
      library: [],
    };

    memoryDb.users[userId] = newUser;
    saveDb(memoryDb);
    return newUser;
  },

  login(email: string, pass: string): StoredUser {
    memoryDb = loadDb();
    const normalizedEmail = email.trim().toLowerCase();
    const user = Object.values(memoryDb.users).find(
      (u) => u.email.toLowerCase() === normalizedEmail
    );

    if (!user) {
      throw new Error("No account found with this email.");
    }

    const hashed = hashPassword(pass, user.salt);
    if (hashed !== user.passwordHash) {
      throw new Error("Incorrect password. Please try again.");
    }

    return user;
  },

  getUser(userId: string): StoredUser | null {
    memoryDb = loadDb();
    return memoryDb.users[userId] || null;
  },

  getLibrary(userId: string): any[] {
    memoryDb = loadDb();
    return memoryDb.users[userId]?.library || [];
  },

  saveLibrary(userId: string, library: any[]): any[] {
    memoryDb = loadDb();
    if (memoryDb.users[userId]) {
      memoryDb.users[userId].library = library;
      saveDb(memoryDb);
    }
    return library;
  },

  getAllUsers(): Omit<StoredUser, "passwordHash" | "salt">[] {
    memoryDb = loadDb();
    return Object.values(memoryDb.users).map(({ passwordHash, salt, ...rest }) => rest);
  },

  // Rooms management
  trackRoom(roomCode: string, name: string, mediaUrl: string, mediaType: string, memberName?: string) {
    memoryDb = loadDb();
    const code = roomCode.toUpperCase();
    if (!memoryDb.rooms[code]) {
      memoryDb.rooms[code] = {
        roomCode: code,
        name: name || `Room ${code}`,
        mediaUrl: mediaUrl || "",
        mediaType: mediaType || "MP4",
        activeUsersCount: 1,
        members: memberName ? [memberName] : ["Host"],
        createdAt: Date.now(),
        lastActive: Date.now(),
      };
    } else {
      const r = memoryDb.rooms[code];
      r.lastActive = Date.now();
      if (mediaUrl) r.mediaUrl = mediaUrl;
      if (mediaType) r.mediaType = mediaType;
      if (memberName && !r.members.includes(memberName)) {
        r.members.push(memberName);
        r.activeUsersCount = r.members.length;
      }
    }
    saveDb(memoryDb);
  },

  getAllRooms(): StoredRoom[] {
    memoryDb = loadDb();
    return Object.values(memoryDb.rooms);
  },

  terminateRoom(roomCode: string): boolean {
    memoryDb = loadDb();
    const code = roomCode.toUpperCase();
    if (memoryDb.rooms[code]) {
      delete memoryDb.rooms[code];
      saveDb(memoryDb);
      return true;
    }
    return false;
  },
};
