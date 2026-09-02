package com.watch2gether.app.sync

import com.watch2gether.app.data.model.PlaybackStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncMathTest {

    @Test
    fun testCalculateSyncSample_cristiansAlgorithm() {
        val t1 = 1000L // client send
        val t2 = 1050L // server receive/transmit
        val t4 = 1100L // client receive

        val sample = SyncMath.calculateSyncSample(t1, t2, t4)
        // RTT = 1100 - 1000 = 100ms
        // Offset = 1050 - (1000 + 100/2) = 1050 - 1050 = 0ms
        assertEquals(100L, sample.rtt)
        assertEquals(0L, sample.offset)
    }

    @Test
    fun testCalculateSyncSample_withPositiveOffset() {
        val t1 = 1000L
        val t2 = 1200L // server is 150ms ahead
        val t4 = 1100L

        val sample = SyncMath.calculateSyncSample(t1, t2, t4)
        assertEquals(100L, sample.rtt)
        assertEquals(150L, sample.offset)
    }

    @Test
    fun testDeriveAuthoritativeOffset_selectsBestRttWithEma() {
        val s1 = SyncSample(rtt = 120L, offset = 100L, clientTimestamp = 1000L, serverTimestamp = 1100L)
        val s2 = SyncSample(rtt = 30L, offset = 60L, clientTimestamp = 2000L, serverTimestamp = 2060L) // best
        val s3 = SyncSample(rtt = 90L, offset = 80L, clientTimestamp = 3000L, serverTimestamp = 3080L)

        // Previous offset = 50L. Alpha = 0.7.
        // Best sample is s2 (offset=60). Smoothed = 0.7 * 60 + 0.3 * 50 = 42 + 15 = 57L
        val (smoothed, bestRtt) = SyncMath.deriveAuthoritativeOffset(listOf(s1, s2, s3), previousOffset = 50L, smoothingAlpha = 0.7)
        assertEquals(30L, bestRtt)
        assertEquals(57L, smoothed)
    }

    @Test
    fun testReconcile_tier1Deadband() {
        // Drift is 80ms (<= 150ms deadband)
        val action = SyncMath.reconcile(currentPositionSeconds = 10.0, targetPositionSeconds = 10.08)
        assertTrue(action is ReconciliationAction.None)
        assertEquals(80L, (action as ReconciliationAction.None).driftMs)
    }

    @Test
    fun testReconcile_tier2CatchUp() {
        // Target is ahead by 400ms (client is behind) -> speed up by 1.08x
        val action = SyncMath.reconcile(currentPositionSeconds = 10.0, targetPositionSeconds = 10.40, basePlaybackRate = 1.0)
        assertTrue(action is ReconciliationAction.RateAdjust)
        val rateAction = action as ReconciliationAction.RateAdjust
        assertEquals(1.08f, rateAction.targetRate, 0.001f)
        assertEquals(400L, rateAction.driftMs)
    }

    @Test
    fun testReconcile_tier2SlowDown() {
        // Target is behind by 300ms (client is ahead) -> slow down by 0.92x
        val action = SyncMath.reconcile(currentPositionSeconds = 10.30, targetPositionSeconds = 10.0, basePlaybackRate = 1.0)
        assertTrue(action is ReconciliationAction.RateAdjust)
        val rateAction = action as ReconciliationAction.RateAdjust
        assertEquals(0.92f, rateAction.targetRate, 0.001f)
        assertEquals(-300L, rateAction.driftMs)
    }

    @Test
    fun testReconcile_tier2ScaledBaseRate() {
        // Base rate is 1.5x, client behind by 500ms -> 1.5 * 1.08 = 1.62f
        val action = SyncMath.reconcile(currentPositionSeconds = 10.0, targetPositionSeconds = 10.50, basePlaybackRate = 1.5)
        assertTrue(action is ReconciliationAction.RateAdjust)
        val rateAction = action as ReconciliationAction.RateAdjust
        assertEquals(1.62f, rateAction.targetRate, 0.01f)
    }

    @Test
    fun testReconcile_tier3HardSeek() {
        // Drift is 2500ms (> 1000ms threshold) -> Hard seek
        val action = SyncMath.reconcile(currentPositionSeconds = 10.0, targetPositionSeconds = 12.5)
        assertTrue(action is ReconciliationAction.HardSeek)
        val seekAction = action as ReconciliationAction.HardSeek
        assertEquals(12.5, seekAction.targetTime, 0.001)
        assertEquals(2500L, seekAction.driftMs)
    }

    @Test
    fun testProjectPlaybackTime_pausedDoesNotAdvance() {
        val projected = SyncMath.projectPlaybackTime(
            status = PlaybackStatus.PAUSED,
            currentTime = 42.0,
            serverTimestamp = 1000L,
            clientCurrentTime = 2000L
        )
        assertEquals(42.0, projected, 0.001)
    }

    @Test
    fun testProjectPlaybackTime_playingAdvances() {
        // 2 seconds elapsed with 1.0x rate -> 42.0 + 2.0 = 44.0
        val projected = SyncMath.projectPlaybackTime(
            status = PlaybackStatus.PLAYING,
            currentTime = 42.0,
            serverTimestamp = 1000L,
            playbackRate = 1.0,
            clientCurrentTime = 3000L,
            clockOffsetTheta = 0L
        )
        assertEquals(44.0, projected, 0.001)
    }

    @Test
    fun testProjectPlaybackTime_clampedToDuration() {
        // 10 seconds elapsed, duration is 45.0s -> projected would be 52.0s without clamp, should clamp to 45.0s
        val projected = SyncMath.projectPlaybackTime(
            status = PlaybackStatus.PLAYING,
            currentTime = 42.0,
            serverTimestamp = 1000L,
            playbackRate = 1.0,
            duration = 45.0,
            clientCurrentTime = 11000L
        )
        assertEquals(45.0, projected, 0.001)
    }
}
