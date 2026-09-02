package com.watch2gether.app.sync

import com.watch2gether.app.data.model.PlaybackStatus
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

data class SyncSample(
    val rtt: Long,
    val offset: Long,
    val clientTimestamp: Long,
    val serverTimestamp: Long
)

sealed class ReconciliationAction {
    data class None(val driftMs: Long) : ReconciliationAction()
    data class RateAdjust(val targetRate: Float, val driftMs: Long) : ReconciliationAction()
    data class HardSeek(val targetTime: Double, val driftMs: Long) : ReconciliationAction()
}

object SyncMath {

    const val DEADBAND_MS = 150L
    const val HARD_SEEK_THRESHOLD_MS = 1000L

    const val RATE_FAST_MULTIPLIER = 1.08
    const val RATE_SLOW_MULTIPLIER = 0.92

    /**
     * Calculates clock offset (theta) and round-trip time from an NTP ping/pong exchange.
     * T1: clientSendTime
     * T2: serverTime
     * T4: clientReceiveTime
     * RTT = T4 - T1
     * Theta = T2 - (T1 + RTT / 2)
     */
    fun calculateSyncSample(
        clientSendTime: Long,
        serverTime: Long,
        clientReceiveTime: Long
    ): SyncSample {
        val rtt = max(0L, clientReceiveTime - clientSendTime)
        val offset = serverTime - (clientSendTime + rtt / 2)
        return SyncSample(
            rtt = rtt,
            offset = offset,
            clientTimestamp = clientReceiveTime,
            serverTimestamp = serverTime
        )
    }

    /**
     * Filters sample window and derives filtered clock offset using lowest-RTT selection and EMA smoothing.
     */
    fun deriveAuthoritativeOffset(
        samples: List<SyncSample>,
        previousOffset: Long = 0L,
        smoothingAlpha: Double = 0.7
    ): Pair<Long, Long> {
        if (samples.isEmpty()) return Pair(previousOffset, 0L)

        val bestSample = samples.minByOrNull { it.rtt } ?: samples.first()
        if (samples.size == 1) {
            return Pair(bestSample.offset, bestSample.rtt)
        }

        val smoothed = (smoothingAlpha * bestSample.offset + (1.0 - smoothingAlpha) * previousOffset).roundToLong()
        return Pair(smoothed, bestSample.rtt)
    }

    /**
     * Projects expected video playback time at the current local device timestamp, clamped to duration.
     */
    fun projectPlaybackTime(
        status: PlaybackStatus,
        currentTime: Double,
        serverTimestamp: Long,
        playbackRate: Double = 1.0,
        duration: Double? = null,
        clientCurrentTime: Long = System.currentTimeMillis(),
        clockOffsetTheta: Long = 0L
    ): Double {
        if (status != PlaybackStatus.PLAYING) {
            return max(0.0, currentTime)
        }

        val currentServerTime = clientCurrentTime + clockOffsetTheta
        val elapsedMs = max(0L, currentServerTime - serverTimestamp)
        val elapsedSeconds = elapsedMs / 1000.0
        val projected = max(0.0, currentTime + (elapsedSeconds * playbackRate))

        return if (duration != null && duration > 0.0) {
            min(projected, duration)
        } else {
            projected
        }
    }

    /**
     * 3-tier reconciliation decision based on clock-compensated drift.
     * Aligned with @watch2gether/shared:
     * Tier 1: |drift| <= 150ms -> Deadband (no-op, normal rate)
     * Tier 2: 150ms < |drift| <= 1000ms -> Micro-Rate adjustment (baseRate * 1.08 / 0.92)
     * Tier 3: |drift| > 1000ms -> Hard Seek
     */
    fun reconcile(
        currentPositionSeconds: Double,
        targetPositionSeconds: Double,
        basePlaybackRate: Double = 1.0
    ): ReconciliationAction {
        val driftMs = ((targetPositionSeconds - currentPositionSeconds) * 1000.0).roundToLong()
        val absDrift = abs(driftMs)

        return when {
            absDrift <= DEADBAND_MS -> ReconciliationAction.None(driftMs)
            absDrift <= HARD_SEEK_THRESHOLD_MS -> {
                val targetRate = if (driftMs > 0) {
                    (basePlaybackRate * RATE_FAST_MULTIPLIER).toFloat()
                } else {
                    (basePlaybackRate * RATE_SLOW_MULTIPLIER).toFloat()
                }
                ReconciliationAction.RateAdjust(targetRate, driftMs)
            }
            else -> ReconciliationAction.HardSeek(targetPositionSeconds, driftMs)
        }
    }
}
