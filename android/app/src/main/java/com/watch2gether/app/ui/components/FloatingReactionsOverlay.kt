package com.watch2gether.app.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.watch2gether.app.data.model.ReactionBurstDTO
import kotlinx.coroutines.delay
import java.util.UUID
import kotlin.random.Random

data class ActiveParticle(
    val id: String = UUID.randomUUID().toString(),
    val emoji: String,
    val startXRatio: Float,
    val wobbleRatio: Float,
    val sizeSp: Int
)

private const val MAX_PARTICLES = 25

@Composable
fun FloatingReactionsOverlay(
    latestBurst: ReactionBurstDTO?,
    modifier: Modifier = Modifier
) {
    val particles = remember { mutableStateListOf<ActiveParticle>() }

    LaunchedEffect(latestBurst) {
        if (latestBurst != null) {
            val count = (latestBurst.count ?: 1).coerceIn(1, 6)
            repeat(count) {
                // Enforce upper bound capacity during emoji storms
                if (particles.size >= MAX_PARTICLES) {
                    particles.removeAt(0)
                }
                val particle = ActiveParticle(
                    emoji = latestBurst.emoji,
                    startXRatio = (latestBurst.x ?: 0.5f) + (Random.nextFloat() * 0.15f - 0.075f),
                    wobbleRatio = Random.nextFloat() * 40f - 20f,
                    sizeSp = Random.nextInt(26, 36)
                )
                particles.add(particle)
            }
        }
    }

    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val maxHeightPx = with(LocalDensity.current) { maxHeight.toPx() }
        val maxWidthPx = with(LocalDensity.current) { maxWidth.toPx() }

        particles.forEach { particle ->
            key(particle.id) {
                FloatingEmoji(
                    particle = particle,
                    maxHeightPx = maxHeightPx,
                    maxWidthPx = maxWidthPx,
                    onFinished = { particles.remove(particle) }
                )
            }
        }
    }
}

@Composable
private fun FloatingEmoji(
    particle: ActiveParticle,
    maxHeightPx: Float,
    maxWidthPx: Float,
    onFinished: () -> Unit
) {
    val animProgress = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        animProgress.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = 2200, easing = LinearOutSlowInEasing)
        )
        onFinished()
    }

    val progress = animProgress.value
    val yOffset = maxHeightPx * (1f - progress * 0.9f)
    val xBase = (maxWidthPx * particle.startXRatio).coerceIn(20f, maxWidthPx - 60f)
    val xOffset = xBase + kotlin.math.sin(progress * 8.0) * particle.wobbleRatio
    val currentAlpha = (1f - progress).coerceIn(0f, 1f)
    val currentScale = 0.6f + progress * 0.7f

    Box(
        modifier = Modifier
            .graphicsLayer {
                translationX = xOffset.toFloat()
                translationY = yOffset
                scaleX = currentScale
                scaleY = currentScale
                alpha = currentAlpha
            }
    ) {
        Text(
            text = particle.emoji,
            fontSize = particle.sizeSp.sp
        )
    }
}
