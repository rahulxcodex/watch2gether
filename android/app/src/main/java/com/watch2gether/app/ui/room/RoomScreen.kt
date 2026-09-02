package com.watch2gether.app.ui.room

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.watch2gether.app.ui.components.VideoPlayerView

@Composable
fun RoomScreen(
    roomId: String,
    onBack: () -> Unit,
    viewModel: RoomViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var chatMessage by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val isConnected by viewModel.syncEngine.connected.collectAsState()

    LaunchedEffect(roomId) {
        viewModel.initialize(roomId)
    }

    // Auto-scroll chat to bottom on new messages
    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) {
            listState.animateScrollToItem(uiState.messages.size - 1)
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        // Top bar
        TopAppBar(
            title = {
                Column {
                    Text(
                        "Room: ${uiState.room?.code ?: roomId.take(8)}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = if (isConnected) "? Live" else "? Connecting...",
                        fontSize = 12.sp,
                        color = if (isConnected) Color(0xFF00C9A7) else Color.Gray
                    )
                }
            },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                }
            },
            actions = {
                // PiP button
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    IconButton(onClick = { viewModel.enterPip(context) }) {
                        Icon(Icons.Filled.PictureInPicture, contentDescription = "PiP")
                    }
                }
                // Share
                IconButton(onClick = {
                    val shareText = "Join my Watch2Gether room: https://watch2gether.app/room/$roomId"
                    val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(android.content.Intent.EXTRA_TEXT, shareText)
                    }
                    context.startActivity(android.content.Intent.createChooser(intent, "Share Room Link"))
                }) {
                    Icon(Icons.Filled.Share, contentDescription = "Share")
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = MaterialTheme.colorScheme.surface
            )
        )

        // Video Player
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .background(Color.Black)
        ) {
            VideoPlayerView(
                mediaUrl = uiState.mediaUrl,
                isPlaying = uiState.isPlaying,
                seekPosition = uiState.playbackPosition,
                onPlay = { pos -> viewModel.onPlay(pos) },
                onPause = { pos -> viewModel.onPause(pos) },
                onSeek = { pos -> viewModel.onSeek(pos) }
            )
        }

        // Emoji Reactions
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            listOf("??", "??", "??", "??", "??").forEach { emoji ->
                OutlinedButton(
                    onClick = { viewModel.sendReaction(emoji) },
                    contentPadding = PaddingValues(8.dp),
                    modifier = Modifier.size(40.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(emoji, fontSize = 18.sp)
                }
            }
            // Recent reactions float
            if (uiState.reactions.isNotEmpty()) {
                Text(
                    uiState.reactions.takeLast(3).joinToString(""),
                    fontSize = 20.sp,
                    modifier = Modifier.align(Alignment.CenterVertically)
                )
            }
        }

        Divider()

        // Chat messages
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 16.dp),
            state = listState
        ) {
            items(uiState.messages) { msg ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                ) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        modifier = Modifier.widthIn(max = 280.dp)
                    ) {
                        Column(modifier = Modifier.padding(8.dp)) {
                            Text(
                                msg.senderNickname,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Text(msg.content, fontSize = 14.sp)
                        }
                    }
                }
            }
        }

        // Chat input
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = chatMessage,
                onValueChange = { chatMessage = it },
                placeholder = { Text("Say something...") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(24.dp),
                maxLines = 2
            )
            Spacer(modifier = Modifier.width(8.dp))
            IconButton(
                onClick = {
                    viewModel.sendChat(chatMessage)
                    chatMessage = ""
                },
                enabled = chatMessage.isNotBlank()
            ) {
                Icon(
                    Icons.Filled.Send,
                    contentDescription = "Send",
                    tint = MaterialTheme.colorScheme.primary
                )
            }
        }
    }

    // Error snack
    uiState.error?.let { err ->
        LaunchedEffect(err) {
            viewModel.clearError()
        }
    }
}
