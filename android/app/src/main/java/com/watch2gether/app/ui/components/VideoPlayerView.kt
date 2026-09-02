package com.watch2gether.app.ui.components

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView

/**
 * Unified video player component that handles:
 *  - Direct MP4/HLS URLs via ExoPlayer
 *  - YouTube URLs via android-youtube-player
 *
 * Receives sync commands (play/pause/seek) from the RoomViewModel
 * and emits back player state changes.
 */
@Composable
fun VideoPlayerView(
    mediaUrl: String?,
    isPlaying: Boolean,
    seekPosition: Double,
    onPlay: (Double) -> Unit,
    onPause: (Double) -> Unit,
    onSeek: (Double) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var isLoading by remember { mutableStateOf(true) }

    if (mediaUrl == null) {
        Box(
            modifier = modifier.fillMaxSize().background(Color.Black),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(color = Color.White)
        }
        return
    }

    val isYouTube = remember(mediaUrl) {
        mediaUrl.contains("youtube.com") || mediaUrl.contains("youtu.be")
    }

    if (isYouTube) {
        // YouTube Player via android-youtube-player
        YouTubePlayerComposable(
            videoId = extractYouTubeId(mediaUrl),
            isPlaying = isPlaying,
            seekPosition = seekPosition,
            onPlay = onPlay,
            onPause = onPause,
            onSeek = onSeek,
            modifier = modifier
        )
    } else {
        // ExoPlayer for direct URLs (MP4, HLS, etc.)
        val exoPlayer = remember {
            ExoPlayer.Builder(context).build().apply {
                val mediaItem = MediaItem.fromUri(Uri.parse(mediaUrl))
                setMediaItem(mediaItem)
                prepare()
                addListener(object : Player.Listener {
                    override fun onIsPlayingChanged(playing: Boolean) {
                        isLoading = false
                        val pos = currentPosition / 1000.0
                        if (playing) onPlay(pos) else onPause(pos)
                    }
                    override fun onPlaybackStateChanged(state: Int) {
                        isLoading = state == Player.STATE_BUFFERING
                    }
                })
            }
        }

        // Sync external state to player
        LaunchedEffect(isPlaying) {
            if (isPlaying && !exoPlayer.isPlaying) exoPlayer.play()
            else if (!isPlaying && exoPlayer.isPlaying) exoPlayer.pause()
        }

        // Seek if position is significantly different (drift > 1s)
        LaunchedEffect(seekPosition) {
            val currentSec = exoPlayer.currentPosition / 1000.0
            if (kotlin.math.abs(currentSec - seekPosition) > 1.0) {
                exoPlayer.seekTo((seekPosition * 1000).toLong())
            }
        }

        DisposableEffect(Unit) {
            onDispose { exoPlayer.release() }
        }

        Box(modifier = modifier.fillMaxSize().background(Color.Black)) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        player = exoPlayer
                        useController = true
                    }
                },
                modifier = Modifier.fillMaxSize()
            )
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = Color.White
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
    modifier: Modifier = Modifier
) {
    AndroidView(
        factory = { ctx ->
            com.pierfrancescosoffritti.androidyoutubeplayer.core.player.views.YouTubePlayerView(ctx).apply {
                addYouTubePlayerListener(object :
                    com.pierfrancescosoffritti.androidyoutubeplayer.core.player.listeners.AbstractYouTubePlayerListener() {
                    override fun onReady(youTubePlayer: com.pierfrancescosoffritti.androidyoutubeplayer.core.player.YouTubePlayer) {
                        youTubePlayer.loadVideo(videoId, seekPosition.toFloat())
                        if (!isPlaying) youTubePlayer.pause()
                    }
                    override fun onStateChange(
                        youTubePlayer: com.pierfrancescosoffritti.androidyoutubeplayer.core.player.YouTubePlayer,
                        state: com.pierfrancescosoffritti.androidyoutubeplayer.core.player.PlayerConstants.PlayerState
                    ) {
                        // Note: We emit back to viewmodel on host state changes only
                    }
                })
            }
        },
        modifier = modifier.fillMaxSize()
    )
}

private fun extractYouTubeId(url: String): String {
    return when {
        url.contains("youtu.be/") -> url.substringAfterLast("youtu.be/").substringBefore("?")
        url.contains("v=") -> url.substringAfter("v=").substringBefore("&")
        else -> url.substringAfterLast("/")
    }
}
