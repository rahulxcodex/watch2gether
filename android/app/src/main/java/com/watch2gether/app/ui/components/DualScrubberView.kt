package com.watch2gether.app.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.watch2gether.app.data.model.PartnerProgressDTO
import kotlin.math.abs
import kotlin.math.max

@Composable
fun DualScrubberView(
    currentTime: Double,
    duration: Double,
    bufferedPosition: Double = 0.0,
    partnerProgress: PartnerProgressDTO? = null,
    canControl: Boolean = true,
    onSeek: (Double) -> Unit,
    modifier: Modifier = Modifier
) {
    val safeDuration = if (duration > 0) duration else 1.0
    val progress = (currentTime / safeDuration).coerceIn(0.0, 1.0).toFloat()
    val bufferProgress = (bufferedPosition / safeDuration).coerceIn(0.0, 1.0).toFloat()
    val partnerRatio = partnerProgress?.let {
        (it.currentTime / safeDuration).coerceIn(0.0, 1.0).toFloat()
    }

    // Detect convergence (< 150ms) for ping pulse
    val driftMs = partnerProgress?.let { abs((currentTime - it.currentTime) * 1000).toLong() } ?: 9999L
    val isConverged = partnerProgress != null && driftMs <= 150L

    // One-shot ping animation on convergence
    val pingAnim = remember { Animatable(0f) }
    LaunchedEffect(isConverged) {
        if (isConverged) {
            pingAnim.snapTo(0f)
            pingAnim.animateTo(
                targetValue = 1f,
                animationSpec = tween(durationMillis = 650, easing = FastOutSlowInEasing)
            )
        }
    }

    val pingScale = 1f + (pingAnim.value * 1.5f)
    val pingAlpha = (1f - pingAnim.value) * 0.8f

    var isDragging by remember { mutableStateOf(false) }
    var dragProgress by remember { mutableFloatStateOf(0f) }
    val effectiveProgress = if (isDragging) dragProgress else progress

    Column(modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        // Track Touch Area (44dp Material accessible target)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(44.dp)
                .pointerInput(canControl, safeDuration) {
                    if (!canControl) return@pointerInput
                    detectTapGestures { offset ->
                        val newFraction = (offset.x / size.width).coerceIn(0f, 1f)
                        onSeek(newFraction * safeDuration)
                    }
                }
                .pointerInput(canControl, safeDuration) {
                    if (!canControl) return@pointerInput
                    detectHorizontalDragGestures(
                        onDragStart = { offset ->
                            isDragging = true
                            dragProgress = (offset.x / size.width).coerceIn(0f, 1f)
                        },
                        onDragEnd = {
                            isDragging = false
                            onSeek(dragProgress.toDouble() * safeDuration)
                        },
                        onDragCancel = {
                            isDragging = false
                        },
                        onHorizontalDrag = { change, _ ->
                            change.consume()
                            dragProgress = (change.position.x / size.width).coerceIn(0f, 1f)
                        }
                    )
                },
            contentAlignment = Alignment.CenterStart
        ) {
            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
            ) {
                val canvasWidth = size.width
                val canvasHeight = size.height
                val corner = CornerRadius(canvasHeight / 2, canvasHeight / 2)

                // Background track
                drawRoundRect(
                    color = Color.White.copy(alpha = 0.2f),
                    size = Size(canvasWidth, canvasHeight),
                    cornerRadius = corner
                )

                // Buffer progress
                if (bufferProgress > 0f) {
                    drawRoundRect(
                        color = Color.White.copy(alpha = 0.4f),
                        size = Size(canvasWidth * bufferProgress, canvasHeight),
                        cornerRadius = corner
                    )
                }

                // Active progress bar (Indigo gradient)
                drawRoundRect(
                    brush = Brush.horizontalGradient(
                        colors = listOf(Color(0xFF6366F1), Color(0xFFA855F7))
                    ),
                    size = Size(canvasWidth * effectiveProgress, canvasHeight),
                    cornerRadius = corner
                )

                // Local Scrubber Knob
                val knobX = canvasWidth * effectiveProgress
                drawCircle(
                    color = Color.White,
                    radius = 8.dp.toPx(),
                    center = Offset(knobX, canvasHeight / 2)
                )
                drawCircle(
                    color = Color(0xFF6366F1),
                    radius = 4.dp.toPx(),
                    center = Offset(knobX, canvasHeight / 2)
                )

                // Partner Playhead Marker
                if (partnerRatio != null) {
                    val partnerX = canvasWidth * partnerRatio
                    val partnerColor = try {
                        Color(android.graphics.Color.parseColor(partnerProgress.color ?: "#06B6D4"))
                    } catch (_: Exception) {
                        Color(0xFF06B6D4)
                    }

                    // Convergence pulse ring (only rendered during convergence burst)
                    if (pingAlpha > 0.05f) {
                        drawCircle(
                            color = Color(0xFF10B981).copy(alpha = pingAlpha),
                            radius = 12.dp.toPx() * pingScale,
                            center = Offset(partnerX, canvasHeight / 2),
                            style = Stroke(width = 2.dp.toPx())
                        )
                    }

                    drawCircle(
                        color = partnerColor,
                        radius = 6.dp.toPx(),
                        center = Offset(partnerX, canvasHeight / 2),
                        style = Fill
                    )
                    drawCircle(
                        color = Color.White,
                        radius = 2.dp.toPx(),
                        center = Offset(partnerX, canvasHeight / 2),
                        style = Fill
                    )
                }
            }
        }

        // Time indicators & partner drift text
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "${formatSeconds(currentTime)} / ${formatSeconds(duration)}",
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            if (partnerProgress != null) {
                val driftText = when {
                    isConverged -> "• Synced (±${driftMs}ms)"
                    currentTime > partnerProgress.currentTime -> "• +${driftMs}ms ahead"
                    else -> "• -${driftMs}ms behind"
                }
                val driftColor = when {
                    isConverged -> Color(0xFF10B981)
                    driftMs <= 1000L -> Color(0xFFF59E0B)
                    else -> Color(0xFFEF4444)
                }
                Text(
                    text = "${partnerProgress.name}: $driftText",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = driftColor
                )
            }
        }
    }
}

private fun formatSeconds(sec: Double): String {
    val totalSec = max(0, sec.toInt())
    val m = totalSec / 60
    val s = totalSec % 60
    val h = m / 60
    return if (h > 0) {
        String.format("%d:%02d:%02d", h, m % 60, s)
    } else {
        String.format("%02d:%02d", m, s)
    }
}
