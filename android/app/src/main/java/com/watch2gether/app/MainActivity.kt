package com.watch2gether.app

import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.annotation.RequiresApi
import com.watch2gether.app.ui.Watch2GetherNavHost
import com.watch2gether.app.ui.theme.Watch2GetherTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            Watch2GetherTheme {
                Watch2GetherNavHost()
            }
        }
    }

    /**
     * Called when the user enters/exits PiP mode.
     * The UI should respond by showing a stripped-down player-only layout.
     */
    @RequiresApi(Build.VERSION_CODES.O)
    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        // TODO: communicate to RoomViewModel to toggle PiP layout mode
    }
}
