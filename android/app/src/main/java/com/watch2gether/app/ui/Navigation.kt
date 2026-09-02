package com.watch2gether.app.ui

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import com.watch2gether.app.ui.home.HomeScreen
import com.watch2gether.app.ui.room.RoomScreen

sealed class Screen(val route: String) {
    object Home : Screen("home")
    object Room : Screen("room/{roomId}") {
        fun createRoute(roomId: String) = "room/$roomId"
    }
}

@Composable
fun Watch2GetherNavHost() {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = Screen.Home.route) {
        composable(Screen.Home.route) {
            HomeScreen(
                onRoomCreated = { roomId ->
                    navController.navigate(Screen.Room.createRoute(roomId))
                },
                onJoinRoom = { roomId ->
                    navController.navigate(Screen.Room.createRoute(roomId))
                }
            )
        }
        composable(
            route = Screen.Room.route,
            arguments = listOf(navArgument("roomId") { type = NavType.StringType }),
            deepLinks = listOf(
                // Custom scheme: watch2gether://room/{roomId}
                navDeepLink { uriPattern = "watch2gether://room/{roomId}" },
                // HTTPS App Link: https://watch2gether.app/room/{roomId}
                navDeepLink { uriPattern = "https://watch2gether.app/room/{roomId}" }
            )
        ) { backStackEntry ->
            val roomId = backStackEntry.arguments?.getString("roomId") ?: return@composable
            RoomScreen(
                roomId = roomId,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
