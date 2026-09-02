package com.watch2gether.app.ui.components

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.watch2gether.app.data.model.MediaType
import com.watch2gether.app.data.model.QueueItemDTO

data class MediaPreset(
    val title: String,
    val url: String,
    val type: MediaType,
    val description: String
)

val DEFAULT_PRESETS = listOf(
    MediaPreset(
        title = "Big Buck Bunny (Trailer)",
        url = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        type = MediaType.MP4,
        description = "Open source blender demo (1080p MP4)"
    ),
    MediaPreset(
        title = "Tears of Steel (Sci-Fi Demo)",
        url = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
        type = MediaType.MP4,
        description = "VFX showcase short film (MP4)"
    ),
    MediaPreset(
        title = "View From A Blue Moon",
        url = "https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-576p.mp4",
        type = MediaType.MP4,
        description = "Action sports surf trailer (MP4)"
    ),
    MediaPreset(
        title = "YouTube: Blender Open Movie",
        url = "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
        type = MediaType.YOUTUBE,
        description = "Big Buck Bunny 60fps on YouTube"
    )
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MediaShelfContent(
    queue: List<QueueItemDTO>,
    currentMediaUrl: String?,
    canControl: Boolean,
    onAddToQueue: (QueueItemDTO) -> Unit,
    onRemoveFromQueue: (String) -> Unit,
    onPlayItem: (QueueItemDTO) -> Unit,
    onSelectLocalFile: (Uri, String) -> Unit,
    modifier: Modifier = Modifier
) {
    var showAddDialog by remember { mutableStateOf(false) }

    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            val fileName = uri.lastPathSegment ?: "Local Video"
            onSelectLocalFile(uri, fileName)
        }
    }

    Column(modifier = modifier.fillMaxSize().padding(16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    "The Shelf (Queue)",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "${queue.size} videos in queue",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (canControl) {
                Button(
                    onClick = { showAddDialog = true },
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Add Media")
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        if (queue.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .clip(RoundedCornerShape(16.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Filled.VideoLibrary,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Queue is empty",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        "Tap 'Add Media' to queue videos or presets",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxWidth().weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(queue, key = { it.id }) { item ->
                    val isCurrent = item.url == currentMediaUrl
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (isCurrent) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = when (item.mediaType) {
                                    MediaType.YOUTUBE -> Icons.Filled.PlayCircle
                                    MediaType.LOCAL_FILE -> Icons.Filled.Folder
                                    else -> Icons.Filled.Movie
                                },
                                contentDescription = null,
                                tint = if (isCurrent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(32.dp)
                            )

                            Spacer(modifier = Modifier.width(12.dp))

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = item.title,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 14.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = "${item.mediaType.name} ${if (item.addedByName != null) "• Added by " + item.addedByName else ""}",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            if (canControl) {
                                IconButton(onClick = { onPlayItem(item) }) {
                                    Icon(Icons.Filled.PlayArrow, contentDescription = "Play Now", tint = MaterialTheme.colorScheme.primary)
                                }
                                IconButton(onClick = { onRemoveFromQueue(item.id) }) {
                                    Icon(Icons.Filled.DeleteOutline, contentDescription = "Remove", tint = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddMediaDialog(
            onDismiss = { showAddDialog = false },
            onAddPreset = { preset ->
                onAddToQueue(
                    QueueItemDTO(
                        id = "q_${System.currentTimeMillis()}",
                        title = preset.title,
                        url = preset.url,
                        mediaType = preset.type,
                        createdAt = System.currentTimeMillis()
                    )
                )
                showAddDialog = false
            },
            onAddCustomUrl = { url, title, type ->
                onAddToQueue(
                    QueueItemDTO(
                        id = "q_${System.currentTimeMillis()}",
                        title = title,
                        url = url,
                        mediaType = type,
                        createdAt = System.currentTimeMillis()
                    )
                )
                showAddDialog = false
            },
            onPickLocalFile = {
                showAddDialog = false
                filePicker.launch("video/*")
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddMediaDialog(
    onDismiss: () -> Unit,
    onAddPreset: (MediaPreset) -> Unit,
    onAddCustomUrl: (url: String, title: String, type: MediaType) -> Unit,
    onPickLocalFile: () -> Unit
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    var customUrl by remember { mutableStateOf("") }
    var customTitle by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Media to Queue", fontWeight = FontWeight.Bold) },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                TabRow(selectedTabIndex = selectedTab) {
                    Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Presets") })
                    Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("URL") })
                    Tab(selected = selectedTab == 2, onClick = { selectedTab = 2 }, text = { Text("Local") })
                }

                Spacer(modifier = Modifier.height(16.dp))

                when (selectedTab) {
                    0 -> {
                        LazyColumn(modifier = Modifier.heightIn(max = 260.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(DEFAULT_PRESETS) { preset ->
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { onAddPreset(preset) }
                                ) {
                                    Column(modifier = Modifier.padding(10.dp)) {
                                        Text(preset.title, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                        Text(preset.description, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                        }
                    }
                    1 -> {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = customUrl,
                                onValueChange = { customUrl = it },
                                label = { Text("Media URL (YouTube, MP4, HLS)") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true
                            )
                            OutlinedTextField(
                                value = customTitle,
                                onValueChange = { customTitle = it },
                                label = { Text("Title (Optional)") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true
                            )
                            Button(
                                onClick = {
                                    val trimmedUrl = customUrl.trim()
                                    if (trimmedUrl.isNotEmpty()) {
                                        val isYt = trimmedUrl.contains("youtube.com") || trimmedUrl.contains("youtu.be")
                                        val isHls = trimmedUrl.endsWith(".m3u8")
                                        val type = when {
                                            isYt -> MediaType.YOUTUBE
                                            isHls -> MediaType.HLS
                                            else -> MediaType.MP4
                                        }
                                        val title = customTitle.trim().ifEmpty {
                                            if (isYt) "YouTube Video" else trimmedUrl.substringAfterLast("/")
                                        }
                                        onAddCustomUrl(trimmedUrl, title, type)
                                    }
                                },
                                enabled = customUrl.isNotBlank(),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("Add URL to Queue")
                            }
                        }
                    }
                    2 -> {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(Icons.Filled.VideoFile, contentDescription = null, modifier = Modifier.size(48.dp), tint = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.height(12.dp))
                            Text("Select video from your phone storage to play and sync locally.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.height(16.dp))
                            Button(onClick = onPickLocalFile) {
                                Icon(Icons.Filled.FolderOpen, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Choose Local Video")
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        }
    )
}
