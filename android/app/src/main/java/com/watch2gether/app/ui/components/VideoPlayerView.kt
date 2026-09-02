package com.watch2gether.app.ui.components

import android.net.Uri
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.watch2gether.app.data.model.MediaType
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlin.math.abs

@OptIn(UnstableApi::class)
@Composable
fun VideoPlayerView(
    mediaUrl: String?,
    mediaType: MediaType = MediaType.MP4,
    isPlaying: Boolean,
    seekPosition: Double,
    playbackRate: Float = 1.0f,
    canControl: Boolean = true,
    onPlay: (Double) -> Unit,
    onPause: (Double) -> Unit,
    onSeek: (Double) -> Unit,
    onProgressTick: (currentTime: Double, duration: Double, buffered: Double) -> Unit,
    onMediaEnded: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var isBuffering by remember { mutableStateOf(false) }
    var showOverlayControls by remember { mutableStateOf(true) }

    // Auto-hide controls after 3 seconds
    LaunchedEffect(showOverlayControls, isPlaying) {
        if (showOverlayControls && isPlaying) {
            delay(3000)
            showOverlayControls = false
        }
    }

    if (mediaUrl.isNullOrBlank()) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(Color(0xFF0F172A)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                "No media selected",
                color = Color.White.copy(alpha = 0.6f),
                fontSize = 14.sp
            )
        }
        return
    }

    val isYouTube = remember(mediaUrl, mediaType) {
        mediaType == MediaType.YOUTUBE ||
        mediaUrl.contains("youtube.com") ||
        mediaUrl.contains("youtu.be")
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null
            ) {
                showOverlayControls = !showOverlayControls
            }
    ) {
        if (isYouTube) {
            // Embedded YouTube Player
            YouTubePlayerComposable(
                videoId = extractYouTubeId(mediaUrl),
                isPlaying = isPlaying,
                seekPosition = seekPosition,
                onPlay = onPlay,
                onPause = onPause,
                onSeek = onSeek,
                onProgressTick = onProgressTick,
                onMediaEnded = onMediaEnded
            )
        } else {
            // AndroidX Media3 ExoPlayer
            val exoPlayer = remember(context) {
                ExoPlayer.Builder(context).build().apply {
                    playWhenReady = isPlaying
                }
            }

            // Update Media Source when URL changes
            LaunchedEffect(mediaUrl) {
                val uri = Uri.parse(mediaUrl)
                val item = MediaItem.fromUri(uri)
                exoPlayer.setMediaItem(item)
                exoPlayer.prepare()
                if (seekPosition > 0) {
                    exoPlayer.seekTo((seekPosition * 1000).toLong())
                }
            }

            // Sync play/pause state
            LaunchedEffect(isPlaying) {
                if (isPlaying != exoPlayer.isPlaying) {
                    if (isPlaying) exoPlayer.play() else exoPlayer.pause()
                }
            }

            // Sync 3-tier playback rate adjustment
            LaunchedEffect(playbackRate) {
                exoPlayer.playbackParameters = PlaybackParameters(playbackRate)
            }

            // Hard seek if drift > 1.0s
            LaunchedEffect(seekPosition) {
                val currentSec = exoPlayer.currentPosition / 1000.0
                if (abs(currentSec - seekPosition) > 1.0) {
                    exoPlayer.seekTo((seekPosition * 1000).toLong())
                }
            }

            // Player listeners and lifecycle binding
            val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
            DisposableEffect(exoPlayer, lifecycleOwner) {
                val listener = object : Player.Listener {
                    override fun onPlaybackStateChanged(state: Int) {
                        isBuffering = (state == Player.STATE_BUFFERING)
                        if (state == Player.STATE_ENDED) {
                            onMediaEnded()
                        }
                    }

                    override fun onIsPlayingChanged(playing: Boolean) {
                        isBuffering = false
                    }
                }
                exoPlayer.addListener(listener)

                val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
                    if (event == androidx.lifecycle.Lifecycle.Event.ON_STOP) {
                        val isPip = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O && context is android.app.Activity) {
                            context.isInPictureInPictureMode
                        } else false
                        if (!isPip) {
                            exoPlayer.pause()
                        }
                    }
                }
                lifecycleOwner.lifecycle.addObserver(observer)

                onDispose {
                    lifecycleOwner.lifecycle.removeObserver(observer)
                    exoPlayer.removeListener(listener)
                    exoPlayer.release()
                }
            }

            // High-frequency position ticker (every 250ms)
            LaunchedEffect(exoPlayer) {
                while (isActive) {
                    val curSec = exoPlayer.currentPosition / 1000.0
                    val durSec = if (exoPlayer.duration > 0) exoPlayer.duration / 1000.0 else 0.0
                    val bufSec = exoPlayer.bufferedPosition / 1000.0
                    onProgressTick(curSec, durSec, bufSec)
                    delay(250)
                }
            }

            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        player = exoPlayer
                        useController = false // Custom Jetpack Compose controls
                    }
                },
                modifier = Modifier.fillMaxSize()
            )

            // Custom Player Controls Overlay
            AnimatedVisibility(
                visible = showOverlayControls,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier.fillMaxSize()
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.4f)),
                    contentAlignment = Alignment.Center
                ) {
                    if (canControl) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(24.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // -10s Rewind
                            IconButton(
                                onClick = {
                                    val newPos = (exoPlayer.currentPosition / 1000.0) - 10.0
                                    onSeek(newPos.coerceAtLeast(0.0))
                                }
                            ) {
                                Icon(
                                    Icons.Filled.Replay10,
                                    contentDescription = "Rewind 10s",
                                    tint = Color.White,
                                    modifier = Modifier.size(36.dp)
                                )
                            }

                            // Play / Pause
                            IconButton(
                                onClick = {
                                    val curPos = exoPlayer.currentPosition / 1000.0
                                    if (isPlaying) onPause(curPos) else onPlay(curPos)
                                },
                                modifier = Modifier
                                    .size(56.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.primary)
                            ) {
                                Icon(
                                    imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                                    contentDescription = if (isPlaying) "Pause" else "Play",
                                    tint = Color.White,
                                    modifier = Modifier.size(32.dp)
                                )
                            }

                            // +10s Fast Forward
                            IconButton(
                                onClick = {
                                    val newPos = (exoPlayer.currentPosition / 1000.0) + 10.0
                                    onSeek(newPos)
                                }
                            ) {
                                Icon(
                                    Icons.Filled.Forward10,
                                    contentDescription = "Forward 10s",
                                    tint = Color.White,
                                    modifier = Modifier.size(36.dp)
                                )
                            }
                        }
                    } else {
                        // Host only control badge
                        Surface(
                            shape = CircleShape,
                            color = Color.Black.copy(alpha = 0.7f),
                            modifier = Modifier.padding(8.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Filled.Lock,
                                    contentDescription = null,
                                    tint = Color(0xFFF59E0B),
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    "Host-controlled playback",
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }
                }
            }
        }

        // Buffering Indicator
        if (isBuffering) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.3f)),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    color = MaterialTheme.colorScheme.primary,
                    strokeWidth = 3.dp,
                    modifier = Modifier.size(48.dp)
                )
            }
        }
    }
}

@Composable
private fun YouTubePlayerComposable(
    videoId: String,
    isPlaying: Boolean,
    seekPosition: Double,
    onPlay: (Double) -> Unit,
    onPause: (Double) -> Unit,
    onSeek: (Double) -> Unit,
    onProgressTick: (currentTime: Double, duration: Double, buffered: Double) -> Unit,
    onMediaEnded: () -> Unit
) {
    var playerRef by remember { mutableStateOf<com.pierfrancescosoffritti.androidyoutubeplayer.core.player.YouTubePlayer?>(null) }

    LaunchedEffect(isPlaying, playerRef) {
        val p = playerRef ?: return@LaunchedEffect
        if (isPlaying) p.play() else p.pause()
    }

    LaunchedEffect(seekPosition, playerRef) {
        val p = playerRef ?: return@LaunchedEffect
        p.seekTo(seekPosition.toFloat())
    }

    var ytCurrentTime by remember { mutableDoubleStateOf(0.0) }
    var ytDuration by remember { mutableDoubleStateOf(0.0) }
    var ytViewRef by remember { mutableStateOf<com.pierfrancescosoffritti.androidyoutubeplayer.core.player.views.YouTubePlayerView?>(null) }

    DisposableEffect(Unit) {
        onDispose {
            ytViewRef?.release()
        }
    }

    AndroidView(
        factory = { ctx ->
            com.pierfrancescosoffritti.androidyoutubeplayer.core.player.views.YouTubePlayerView(ctx).apply {
                ytViewRef = this
                enableAutomaticInitialization = false
                initialize(object :
                    com.pierfrancescosoffritti.androidyoutubeplayer.core.player.listeners.AbstractYouTubePlayerListener() {
                    override fun onReady(youTubePlayer: com.pierfrancescosoffritti.androidyoutubeplayer.core.player.YouTubePlayer) {
                        playerRef = youTubePlayer
                        youTubePlayer.loadVideo(videoId, seekPosition.toFloat())
                        if (!isPlaying) youTubePlayer.pause()
                    }

                    override fun onCurrentSecond(
                        youTubePlayer: com.pierfrancescosoffritti.androidyoutubeplayer.core.player.YouTubePlayer,
                        second: Float
                    ) {
                        ytCurrentTime = second.toDouble()
                        onProgressTick(ytCurrentTime, ytDuration, 0.0)
                    }

                    override fun onVideoDuration(
                        youTubePlayer: com.pierfrancescosoffritti.androidyoutubeplayer.core.player.YouTubePlayer,
                        duration: Float
                    ) {
                        ytDuration = duration.toDouble()
                        onProgressTick(ytCurrentTime, ytDuration, 0.0)
                    }

                    override fun onStateChange(
                        youTubePlayer: com.pierfrancescosoffritti.androidyoutubeplayer.core.player.YouTubePlayer,
                        state: com.pierfrancescosoffritti.androidyoutubeplayer.core.player.PlayerConstants.PlayerState
                    ) {
                        when (state) {
                            com.pierfrancescosoffritti.androidyoutubeplayer.core.player.PlayerConstants.PlayerState.ENDED -> {
                                onMediaEnded()
                            }
                            else -> {}
                        }
                    }
                })
            }
        },
        modifier = Modifier.fillMaxSize()
    )
}

private fun extractYouTubeId(url: String): String {
    return when {
        url.contains("youtu.be/") -> url.substringAfterLast("youtu.be/").substringBefore("?")
        url.contains("v=") -> url.substringAfter("v=").substringBefore("&")
        else -> url.substringAfterLast("/")
    }
}
