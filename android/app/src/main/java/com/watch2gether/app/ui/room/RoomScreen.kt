package com.watch2gether.app.ui.room

import android.app.Activity
import android.content.Intent
import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.watch2gether.app.data.model.ChatMessageDTO
import com.watch2gether.app.data.model.MediaType
import com.watch2gether.app.ui.components.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoomScreen(
    roomId: String,
    isInPipMode: Boolean = false,
    onBack: () -> Unit,
    viewModel: RoomViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val isConnected by viewModel.syncEngine.connected.collectAsState()
    val context = LocalContext.current

    var selectedTab by remember { mutableIntStateOf(0) }
    var chatInput by remember { mutableStateOf("") }
    val chatListState = rememberLazyListState()

    LaunchedEffect(roomId) {
        viewModel.initialize(roomId)
    }

    LaunchedEffect(isInPipMode) {
        viewModel.setPipMode(isInPipMode)
    }

    // Auto-scroll chat to bottom smoothly without animation thrashing
    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) {
            val target = uiState.messages.size - 1
            if (chatListState.firstVisibleItemIndex < target - 5) {
                chatListState.scrollToItem(target)
            } else {
                chatListState.animateScrollToItem(target)
            }
        }
    }

    val activePip = isInPipMode || uiState.isInPip

    // PiP Mode: Only render the video player
    if (activePip) {
        Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
            VideoPlayerView(
                mediaUrl = uiState.mediaUrl,
                mediaType = uiState.mediaType,
                isPlaying = uiState.isPlaying,
                seekPosition = uiState.seekPosition,
                playbackRate = uiState.playbackRate,
                canControl = uiState.canControl,
                onPlay = viewModel::onPlay,
                onPause = viewModel::onPause,
                onSeek = viewModel::onSeek,
                onProgressTick = viewModel::onProgressTick,
                onMediaEnded = viewModel::onMediaEnded,
                modifier = Modifier.fillMaxSize()
            )
        }
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = uiState.room?.name ?: "Room $roomId",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(if (isConnected) Color(0xFF10B981) else Color(0xFFF59E0B))
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = if (isConnected) "Live • ${uiState.activeUsers.size} watching" else "Connecting...",
                                fontSize = 11.sp,
                                color = if (isConnected) Color(0xFF10B981) else Color(0xFFF59E0B)
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    // PiP Button
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        IconButton(onClick = { viewModel.enterPip(context) }) {
                            Icon(Icons.Filled.PictureInPicture, contentDescription = "PiP")
                        }
                    }

                    // Share Room Link
                    IconButton(onClick = {
                        val shareText = "Join my Watch2Gether room: https://watch2gether.app/room/$roomId\nCode: $roomId"
                        val intent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_SUBJECT, "Watch2Gether Room Invite")
                            putExtra(Intent.EXTRA_TEXT, shareText)
                        }
                        context.startActivity(Intent.createChooser(intent, "Share Room"))
                    }) {
                        Icon(Icons.Filled.Share, contentDescription = "Share")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(MaterialTheme.colorScheme.background)
        ) {
            // Video Player Section
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .background(Color.Black)
            ) {
                VideoPlayerView(
                    mediaUrl = uiState.mediaUrl,
                    mediaType = uiState.mediaType,
                    isPlaying = uiState.isPlaying,
                    seekPosition = uiState.seekPosition,
                    playbackRate = uiState.playbackRate,
                    canControl = uiState.canControl,
                    onPlay = viewModel::onPlay,
                    onPause = viewModel::onPause,
                    onSeek = viewModel::onSeek,
                    onProgressTick = viewModel::onProgressTick,
                    onMediaEnded = viewModel::onMediaEnded,
                    modifier = Modifier.fillMaxSize()
                )

                // Floating Reactions Animation Canvas
                FloatingReactionsOverlay(
                    latestBurst = uiState.latestReactionBurst,
                    modifier = Modifier.fillMaxSize()
                )
            }

            // Dual Playhead Scrubber Ribbon
            DualScrubberView(
                currentTime = uiState.currentTime,
                duration = uiState.duration,
                bufferedPosition = uiState.bufferedPosition,
                partnerProgress = uiState.partnerProgress,
                canControl = uiState.canControl,
                onSeek = viewModel::onSeek
            )

            // Tabs Header (Chat, The Shelf, Participants)
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.primary
            ) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Chat (${uiState.messages.size})") },
                    icon = { Icon(Icons.Filled.Chat, contentDescription = null, modifier = Modifier.size(18.dp)) }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("The Shelf (${uiState.queue.size})") },
                    icon = { Icon(Icons.Filled.VideoLibrary, contentDescription = null, modifier = Modifier.size(18.dp)) }
                )
                Tab(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    text = { Text("People (${uiState.activeUsers.size})") },
                    icon = { Icon(Icons.Filled.People, contentDescription = null, modifier = Modifier.size(18.dp)) }
                )
            }

            // Tab Content
            when (selectedTab) {
                0 -> {
                    // Chat Tab
                    Column(modifier = Modifier.weight(1f)) {
                        LazyColumn(
                            state = chatListState,
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(uiState.messages, key = { it.id }) { msg ->
                                ChatMessageItem(
                                    message = msg,
                                    isSelf = msg.sender.id == uiState.currentUser.id
                                )
                            }
                        }

                        // Floating Emoji Reactions Bar
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            listOf("❤️", "🔥", "😂", "🎉", "🍿", "👏").forEach { emoji ->
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant,
                                    modifier = Modifier.size(38.dp),
                                    onClick = { viewModel.sendReaction(emoji) }
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Text(emoji, fontSize = 18.sp)
                                    }
                                }
                            }
                        }

                        // Chat Input Bar
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            OutlinedTextField(
                                value = chatInput,
                                onValueChange = { chatInput = it },
                                placeholder = { Text("Say something...") },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(24.dp),
                                singleLine = true
                            )

                            Spacer(modifier = Modifier.width(8.dp))

                            IconButton(
                                onClick = {
                                    viewModel.sendChat(chatInput)
                                    chatInput = ""
                                },
                                enabled = chatInput.isNotBlank(),
                                modifier = Modifier
                                    .size(48.dp)
                                    .clip(CircleShape)
                                    .background(if (chatInput.isNotBlank()) MaterialTheme.colorScheme.primary else Color.Gray.copy(alpha = 0.3f))
                            ) {
                                Icon(Icons.Filled.Send, contentDescription = "Send", tint = Color.White)
                            }
                        }
                    }
                }
                1 -> {
                    // The Shelf / Queue Tab
                    MediaShelfContent(
                        queue = uiState.queue,
                        currentMediaUrl = uiState.mediaUrl,
                        canControl = uiState.canControl,
                        onAddToQueue = viewModel::addToQueue,
                        onRemoveFromQueue = viewModel::removeFromQueue,
                        onPlayItem = { item ->
                            viewModel.switchMedia(item.url, item.mediaType, item.title)
                            viewModel.removeFromQueue(item.id)
                        },
                        onSelectLocalFile = { uri, fileName ->
                            viewModel.switchMedia(uri.toString(), MediaType.LOCAL_FILE, fileName)
                        },
                        modifier = Modifier.weight(1f)
                    )
                }
                2 -> {
                    // Participants Tab
                    ParticipantsContent(
                        users = uiState.activeUsers,
                        currentUserId = uiState.currentUser.id,
                        hostId = uiState.room?.hostId ?: "",
                        permissionMode = uiState.permissionMode,
                        isHost = uiState.isHost,
                        onTogglePermission = viewModel::togglePermission,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

@Composable
fun ChatMessageItem(
    message: ChatMessageDTO,
    isSelf: Boolean
) {
    if (message.system == true) {
        // System announcement pill
        Box(
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
            contentAlignment = Alignment.Center
        ) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
            ) {
                Text(
                    text = message.text,
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
                )
            }
        }
        return
    }

    // User chat bubble
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isSelf) Arrangement.End else Arrangement.Start
    ) {
        if (!isSelf) {
            val userColor = try {
                Color(android.graphics.Color.parseColor(message.sender.displayColor))
            } catch (_: Exception) {
                Color(0xFF6366F1)
            }
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(userColor),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = message.sender.name.firstOrNull()?.uppercase() ?: "U",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
        }

        Surface(
            shape = RoundedCornerShape(
                topStart = 16.dp,
                topEnd = 16.dp,
                bottomStart = if (isSelf) 16.dp else 4.dp,
                bottomEnd = if (isSelf) 4.dp else 16.dp
            ),
            color = if (isSelf) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondaryContainer,
            modifier = Modifier.widthIn(max = 280.dp)
        ) {
            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                if (!isSelf) {
                    Text(
                        text = message.sender.name,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                }
                Text(
                    text = message.text,
                    fontSize = 14.sp,
                    color = if (isSelf) Color.White else MaterialTheme.colorScheme.onSecondaryContainer
                )
            }
        }
    }
}
