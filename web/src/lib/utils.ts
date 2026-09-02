import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export function generateRandomAvatarColor(): string {
  const colors = [
    "#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4",
    "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#14b8a6"
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function generateGuestName(): string {
  const adjectives = ["Cosmic", "Neon", "Swift", "Cozy", "Lucky", "Happy", "Velvet", "Silent", "Radiant", "Brave"];
  const animals = ["Fox", "Panda", "Otter", "Falcon", "Koala", "Tiger", "Dolphin", "Cheetah", "Penguin", "Owl"];
  const randomNum = Math.floor(100 + Math.random() * 900);
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adj} ${animal} ${randomNum}`;
}
