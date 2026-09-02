package com.watch2gether.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Watch2GetherPrimary = Color(0xFF6C63FF)       // Purple
private val Watch2GetherSecondary = Color(0xFF00C9A7)     // Teal
private val Watch2GetherTertiary = Color(0xFFFF6B6B)      // Coral

private val DarkColorScheme = darkColorScheme(
    primary = Watch2GetherPrimary,
    secondary = Watch2GetherSecondary,
    tertiary = Watch2GetherTertiary,
    background = Color(0xFF0F0F0F),
    surface = Color(0xFF1C1C1E),
    onPrimary = Color.White,
    onSecondary = Color.White,
    onBackground = Color.White,
    onSurface = Color.White
)

private val LightColorScheme = lightColorScheme(
    primary = Watch2GetherPrimary,
    secondary = Watch2GetherSecondary,
    tertiary = Watch2GetherTertiary,
    background = Color(0xFFFAFAFA),
    surface = Color.White,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onBackground = Color(0xFF111111),
    onSurface = Color(0xFF111111)
)

@Composable
fun Watch2GetherTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
