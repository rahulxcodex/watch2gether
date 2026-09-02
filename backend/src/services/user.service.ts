import { getDb } from '../db/db';
import { users, NewUser, User } from '../db/schema';
import { eq } from 'drizzle-orm';

export class UserService {
  static async createUser(userData: {
    id: string;
    name: string;
    isGuest?: boolean;
    avatarUrl?: string | null;
  }): Promise<User> {
    const db = getDb();
    const now = new Date();
    const newUser: NewUser = {
      id: userData.id,
      name: userData.name,
      isGuest: userData.isGuest ?? true,
      avatarUrl: userData.avatarUrl ?? null,
      createdAt: now,
      lastActiveAt: now,
    };

    db.insert(users).values(newUser).run();
    const user = await this.getUserById(userData.id);
    return user!;
  }

  static async getUserById(id: string): Promise<User | null> {
    const db = getDb();
    const result = db.select().from(users).where(eq(users.id, id)).get();
    return result || null;
  }

  static async updateUserActive(id: string): Promise<void> {
    const db = getDb();
    db.update(users)
      .set({ lastActiveAt: new Date() })
      .where(eq(users.id, id))
      .run();
  }
}
