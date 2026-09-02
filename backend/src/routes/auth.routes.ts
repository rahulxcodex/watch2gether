import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { UserService } from '../services/user.service';

const guestAuthSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  avatar: z.string().url().optional(),
});

const ADJECTIVES = [
  'Swift',
  'Bright',
  'Cosmic',
  'Gentle',
  'Curious',
  'Brave',
  'Sunny',
  'Silent',
  'Happy',
  'Clever',
];
const ANIMALS = [
  'Otter',
  'Falcon',
  'Fox',
  'Panda',
  'Dolphin',
  'Lynx',
  'Koala',
  'Hawk',
  'Eagle',
  'Badger',
];

function generateGuestName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${adj} ${animal} #${suffix}`;
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/guest', async (request, reply) => {
    const parseResult = guestAuthSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'BadRequest',
        message: 'Invalid request payload',
        details: parseResult.error.flatten(),
      });
    }

    const { name, avatar } = parseResult.data;
    const finalName = name?.trim() || generateGuestName();
    const userId = `usr_${nanoid(10)}`;

    const user = await UserService.createUser({
      id: userId,
      name: finalName,
      isGuest: true,
      avatarUrl: avatar || null,
    });

    const token = fastify.jwt.sign(
      {
        id: user.id,
        name: user.name,
        isGuest: user.isGuest,
      },
      { expiresIn: '7d' }
    );

    reply.setCookie('w2g_token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return reply.status(200).send({
      token,
      user: {
        id: user.id,
        name: user.name,
        isGuest: user.isGuest,
        avatarUrl: user.avatarUrl,
      },
    });
  });
};
