"use client";

import React, { useEffect, useRef } from "react";
import { ReactionBurstDTO } from "@watch2gether/shared";

interface Particle {
  id: string;
  emoji: string;
  x: number; // percentage (0 to 100)
  y: number; // percentage (0 to 100)
  vx: number; // horizontal drift speed
  vy: number; // vertical ascent speed
  scale: number;
  opacity: number;
  rotation: number;
  vRot: number;
  createdAt: number;
  lifeMs: number;
}

interface EmojiReactionCanvasProps {
  bursts: ReactionBurstDTO[];
  className?: string;
}

export function EmojiReactionCanvas({ bursts, className }: EmojiReactionCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const lastProcessedIndexRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // Spawn new particles from incoming bursts
  useEffect(() => {
    if (bursts.length > lastProcessedIndexRef.current) {
      const newBursts = bursts.slice(lastProcessedIndexRef.current);
      lastProcessedIndexRef.current = bursts.length;

      newBursts.forEach((burst) => {
        const count = burst.count || Math.floor(2 + Math.random() * 3);
        const baseX = (burst.x !== undefined ? burst.x * 100 : 75) + (Math.random() * 10 - 5);

        for (let i = 0; i < count; i++) {
          particlesRef.current.push({
            id: "p_" + Math.random().toString(36).substring(2, 9),
            emoji: burst.emoji,
            x: Math.max(10, Math.min(90, baseX + (Math.random() * 16 - 8))),
            y: 90 + Math.random() * 8,
            vx: (Math.random() - 0.5) * 0.4,
            vy: -(0.5 + Math.random() * 0.7),
            scale: 0.8 + Math.random() * 0.6,
            opacity: 1,
            rotation: (Math.random() - 0.5) * 30,
            vRot: (Math.random() - 0.5) * 1.5,
            createdAt: Date.now(),
            lifeMs: 2200 + Math.random() * 600,
          });
        }
      });
    }
  }, [bursts]);

  // Animation Loop updating DOM particle elements
  useEffect(() => {
    let isRunning = true;

    const render = () => {
      if (!isRunning || !containerRef.current) return;
      const now = Date.now();
      const currentParticles = particlesRef.current;
      const activeParticles: Particle[] = [];

      // Clear container and render current particles
      const container = containerRef.current;
      container.innerHTML = "";

      for (let i = 0; i < currentParticles.length; i++) {
        const p = currentParticles[i];
        const age = now - p.createdAt;

        if (age < p.lifeMs) {
          const progress = age / p.lifeMs;
          p.x += p.vx;
          p.y += p.vy;
          p.rotation += p.vRot;
          p.opacity = progress > 0.6 ? 1 - (progress - 0.6) / 0.4 : 1;

          activeParticles.push(p);

          const span = document.createElement("span");
          span.innerText = p.emoji;
          span.style.position = "absolute";
          span.style.left = `${p.x}%`;
          span.style.top = `${p.y}%`;
          span.style.transform = `translate(-50%, -50%) scale(${p.scale}) rotate(${p.rotation}deg)`;
          span.style.opacity = `${p.opacity}`;
          span.style.pointerEvents = "none";
          span.style.fontSize = "28px";
          span.style.filter = "drop-shadow(0 2px 8px rgba(0,0,0,0.5))";
          span.style.userSelect = "none";
          container.appendChild(span);
        }
      }

      particlesRef.current = activeParticles;
      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className || "absolute inset-0 pointer-events-none overflow-hidden z-20"}
      aria-hidden="true"
    />
  );
}
