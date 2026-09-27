package com.soaresden.sunoauto.ui

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.soaresden.sunoauto.auth.LoginActivity
import com.soaresden.sunoauto.ui.components.MiniPlayer
import com.soaresden.sunoauto.ui.screens.DownloadsScreen
import com.soaresden.sunoauto.ui.screens.LibraryScreen
import com.soaresden.sunoauto.ui.screens.LikedScreen
import com.soaresden.sunoauto.ui.screens.NowPlayingScreen
import com.soaresden.sunoauto.ui.screens.OnboardingScreen
import com.soaresden.sunoauto.ui.screens.PlaylistScreen
import com.soaresden.sunoauto.ui.screens.PlaylistsScreen
import com.soaresden.sunoauto.ui.screens.ProjectScreen
import com.soaresden.sunoauto.ui.screens.RecentScreen
import com.soaresden.sunoauto.ui.screens.SearchScreen
import com.soaresden.sunoauto.ui.screens.SettingsScreen
import com.soaresden.sunoauto.ui.theme.SunoTheme

class MainActivity : ComponentActivity() {

    private val loginLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { }
    private val notifLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33) notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        setContent {
            SunoTheme {
                App(onLogin = { loginLauncher.launch(Intent(this, LoginActivity::class.java)) })
            }
        }
    }
}

private object Routes {
    const val LIBRARY = "library"
    const val PROJECT = "project/{id}"
    const val PLAYLISTS = "playlists"
    const val PLAYLIST = "playlist/{id}"
    const val RECENT = "recent"
    const val SEARCH = "search"
    const val LIKED = "liked"
    const val DOWNLOADS = "downloads"
    const val SETTINGS = "settings"
    const val NOW_PLAYING = "now"
    const val ONBOARDING = "onboarding"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun App(onLogin: () -> Unit) {
    val vm: LibraryViewModel = viewModel()
    val player: PlayerViewModel = viewModel()
    val nav: NavHostController = rememberNavController()
    val loggedIn by vm.isLoggedIn.collectAsStateWithLifecycle()
    val playerState by player.state.collectAsStateWithLifecycle()
    val backStack by nav.currentBackStackEntryAsState()
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val folderPicker = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.OpenDocumentTree()
    ) { uri -> if (uri != null) { runCatching { ctx.contentResolver.takePersistableUriPermission(uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION) }; vm.setLocalTree(uri.toString()) } }
    val route = backStack?.destination?.route
    val projects by vm.projects.collectAsStateWithLifecycle()
    val playlists by vm.playlists.collectAsStateWithLifecycle()

    val title = when {
        route == Routes.LIBRARY -> "Workspaces"
        route == Routes.PROJECT -> projects.firstOrNull { it.id == backStack?.arguments?.getString("id") }?.name ?: "Workspace"
        route == Routes.PLAYLIST -> playlists.firstOrNull { it.id == backStack?.arguments?.getString("id") }?.name ?: "Playlist"
        route == Routes.PLAYLISTS -> "Playlists"
        route == Routes.RECENT -> "Récemment écoutés"
        route == Routes.SEARCH -> "Recherche"
        route == Routes.LIKED -> "Favoris"
        route == Routes.DOWNLOADS -> "Téléchargés"
        route == Routes.SETTINGS -> "Réglages · v${com.soaresden.sunoauto.BuildConfig.VERSION_NAME}"
        route == Routes.NOW_PLAYING -> "En lecture"
        else -> "Suno Auto"
    }
    val topLevel = route == Routes.LIBRARY
    val miniHeight = if (playerState.clipId != null && route != Routes.NOW_PLAYING) 64.dp else 0.dp

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    if (!topLevel && route != Routes.ONBOARDING) IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) }
                },
                actions = {}
            )
        },
        bottomBar = {
            if (route == Routes.ONBOARDING) return@Scaffold
            Column {
                if (route != Routes.NOW_PLAYING) MiniPlayer(playerState, onToggle = { player.togglePlay() }, onNext = { player.next() }, onOpen = { nav.navigate(Routes.NOW_PLAYING) })
                val goto: (String) -> Unit = { dest ->
                    if (route != dest) nav.navigate(dest) {
                        popUpTo(Routes.LIBRARY) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                }
                NavigationBar {
                    NavigationBarItem(
                        selected = route == Routes.LIBRARY,
                        onClick = { goto(Routes.LIBRARY) },
                        icon = { Icon(Icons.Default.LibraryMusic, null) },
                        label = { Text("Workspace") }
                    )
                    NavigationBarItem(
                        selected = route == Routes.RECENT,
                        onClick = { goto(Routes.RECENT) },
                        icon = { Icon(Icons.Default.History, null) },
                        label = { Text("Récents") }
                    )
                    NavigationBarItem(
                        selected = route == Routes.PLAYLISTS,
                        onClick = { goto(Routes.PLAYLISTS) },
                        icon = { Icon(Icons.AutoMirrored.Filled.QueueMusic, null) },
                        label = { Text("Playlists") }
                    )
                    NavigationBarItem(
                        selected = route == Routes.SETTINGS,
                        onClick = { goto(Routes.SETTINGS) },
                        icon = { Icon(Icons.Default.Settings, null) },
                        label = { Text("Réglages") }
                    )
                }
                com.soaresden.sunoauto.ui.screens.AccountStatusBar(vm)
            }
        }
    ) { padding ->
        NavHost(nav, startDestination = if (loggedIn == false) Routes.ONBOARDING else Routes.LIBRARY, modifier = Modifier.fillMaxSize().padding(padding)) {
            composable(Routes.ONBOARDING) {
                OnboardingScreen(vm, onLogin = onLogin, onPickFolder = { folderPicker.launch(null) }, onDone = { nav.navigate(Routes.LIBRARY) { popUpTo(Routes.ONBOARDING) { inclusive = true } } })
            }
            composable(Routes.LIBRARY) {
                LibraryScreen(vm, player, onOpenProject = { nav.navigate("project/$it") }, bottomPadding = 0.dp)
            }
            composable(Routes.PROJECT) { ProjectScreen(it.arguments?.getString("id").orEmpty(), vm, player, 0.dp) }
            composable(Routes.PLAYLISTS) { PlaylistsScreen(vm, onOpen = { nav.navigate("playlist/$it") }, bottomPadding = 0.dp) }
            composable(Routes.PLAYLIST) { PlaylistScreen(it.arguments?.getString("id").orEmpty(), vm, player, 0.dp) }
            composable(Routes.RECENT) { RecentScreen(vm, player, 0.dp) }
            composable(Routes.SETTINGS) { SettingsScreen(vm, onLogin = onLogin, bottomPadding = 0.dp) }
            composable(Routes.NOW_PLAYING) { NowPlayingScreen(vm, player) }
        }
    }
}
