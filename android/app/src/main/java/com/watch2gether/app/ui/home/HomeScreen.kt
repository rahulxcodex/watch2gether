package com.watch2gether.app.ui.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.watch2gether.app.data.model.MediaType
import com.watch2gether.app.data.model.PermissionMode
import com.watch2gether.app.ui.components.DEFAULT_PRESETS

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onRoomCreated: (String) -> Unit,
    onJoinRoom: (String) -> Unit,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val nickname by viewModel.nickname.collectAsState()
    val joinCode by viewModel.joinCode.collectAsState()
    val recentRooms by viewModel.recentRooms.collectAsState()

    var showCreateDialog by remember { mutableStateOf(false) }
    var showJoinSection by remember { mutableStateOf(false) }

    LaunchedEffect(uiState) {
        when (val state = uiState) {
            is HomeUiState.Success -> {
                onRoomCreated(state.roomCode)
                viewModel.resetState()
            }
            else -> {}
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFF020617), // slate-950
                        Color(0xFF0F172A)  // slate-900
                    )
                )
            )
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            item {
                Spacer(modifier = Modifier.height(24.dp))
                // Logo & Headline
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(CircleShape)
                        .background(
                            brush = Brush.radialGradient(
                                listOf(Color(0xFF6366F1), Color(0xFF4338CA))
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.PlayArrow,
                        contentDescription = "Watch2Gether",
                        modifier = Modifier.size(48.dp),
                        tint = Color.White
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Watch2Gether",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )

                Text(
                    text = "Synchronized video watch parties in real time.\nZero login required. Just invite and watch.",
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.7f),
                    modifier = Modifier.padding(top = 6.dp)
                )
            }

            item {
                // User Guest Profile Card
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Filled.AccountCircle,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                "Your Identity (Guest)",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 14.sp
                            )
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        OutlinedTextField(
                            value = nickname,
                            onValueChange = viewModel::onNicknameChange,
                            label = { Text("Display Name") },
                            leadingIcon = { Icon(Icons.Filled.Person, contentDescription = null) },
                            trailingIcon = {
                                IconButton(onClick = { viewModel.onNicknameChange(generateGuestName()) }) {
                                    Icon(Icons.Filled.Casino, contentDescription = "Randomize Name")
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            singleLine = true
                        )
                    }
                }
            }

            item {
                // Action Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Create Room
                    Button(
                        onClick = { showCreateDialog = true },
                        enabled = uiState !is HomeUiState.Loading,
                        modifier = Modifier.weight(1f).height(52.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                    ) {
                        Icon(Icons.Filled.Add, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("New Room", fontWeight = FontWeight.Bold)
                    }

                    // Join by Code
                    OutlinedButton(
                        onClick = { showJoinSection = !showJoinSection },
                        modifier = Modifier.weight(1f).height(52.dp),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Icon(Icons.Filled.Login, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Join Room")
                    }
                }
            }

            // Join Room Expandable Section
            if (showJoinSection) {
                item {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                "Join with Code or URL",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 14.sp
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            OutlinedTextField(
                                value = joinCode,
                                onValueChange = viewModel::onJoinCodeChange,
                                placeholder = { Text("Paste link or enter code (e.g. ABC123)") },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                singleLine = true
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            Button(
                                onClick = { viewModel.joinRoom() },
                                enabled = joinCode.isNotBlank() && uiState !is HomeUiState.Loading,
                                modifier = Modifier.fillMaxWidth().height(48.dp),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Text("Connect to Room", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // Recent Rooms Section
            if (recentRooms.isNotEmpty()) {
                item {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "Recent Rooms",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                color = Color.White
                            )
                            Text(
                                "1-tap rejoin",
                                fontSize = 12.sp,
                                color = Color.White.copy(alpha = 0.5f)
                            )
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        recentRooms.forEach { room ->
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.7f),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                                    .clickable { viewModel.joinRoom(room.code) }
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                                        Box(
                                            modifier = Modifier
                                                .size(36.dp)
                                                .clip(CircleShape)
                                                .background(MaterialTheme.colorScheme.primaryContainer),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(
                                                Icons.Filled.Tv,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.primary,
                                                modifier = Modifier.size(20.dp)
                                            )
                                        }
                                        Spacer(modifier = Modifier.width(12.dp))
                                        Column {
                                            Text(
                                                text = room.name,
                                                fontWeight = FontWeight.SemiBold,
                                                fontSize = 14.sp,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                            Text(
                                                text = "Code: ${room.code}",
                                                fontSize = 11.sp,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }

                                    IconButton(onClick = { viewModel.removeRecentRoom(room.code) }) {
                                        Icon(
                                            Icons.Filled.Close,
                                            contentDescription = "Remove",
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showCreateDialog) {
        CreateRoomDialog(
            onDismiss = { showCreateDialog = false },
            onCreate = { name, url, type, mode ->
                viewModel.createRoom(name, url, type, mode)
                showCreateDialog = false
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateRoomDialog(
    onDismiss: () -> Unit,
    onCreate: (name: String, mediaUrl: String, mediaType: MediaType, mode: PermissionMode) -> Unit
) {
    var roomName by remember { mutableStateOf("Watch Party") }
    var selectedPresetIndex by remember { mutableIntStateOf(0) }
    var permissionMode by remember { mutableStateOf(PermissionMode.HOST_ONLY) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Create New Room", fontWeight = FontWeight.Bold) },
        text = {
            Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = roomName,
                    onValueChange = { roomName = it },
                    label = { Text("Room Name") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                Text("Initial Video:", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                DEFAULT_PRESETS.forEachIndexed { index, preset ->
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = if (selectedPresetIndex == index) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { selectedPresetIndex = index }
                    ) {
                        Row(
                            modifier = Modifier.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = selectedPresetIndex == index,
                                onClick = { selectedPresetIndex = index }
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Column {
                                Text(preset.title, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                Text(preset.description, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Playback Control", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        Text(
                            if (permissionMode == PermissionMode.HOST_ONLY) "Only host controls playback" else "Shared control for all",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = permissionMode == PermissionMode.SHARED,
                        onCheckedChange = { shared ->
                            permissionMode = if (shared) PermissionMode.SHARED else PermissionMode.HOST_ONLY
                        }
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val preset = DEFAULT_PRESETS[selectedPresetIndex]
                    onCreate(roomName, preset.url, preset.type, permissionMode)
                }
            ) {
                Text("Create Room")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
