package com.soaresden.sunoauto.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.soaresden.sunoauto.R
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.soaresden.sunoauto.ui.LibraryViewModel

@Composable
fun SettingsScreen(vm: LibraryViewModel, onLogin: () -> Unit, bottomPadding: Dp) {
    val loggedIn by vm.isLoggedIn.collectAsStateWithLifecycle()
    val account by vm.accountLabel.collectAsStateWithLifecycle()
    val plan by vm.accountPlan.collectAsStateWithLifecycle()
    val credits by vm.credits.collectAsStateWithLifecycle()
    val importState by vm.importState.collectAsStateWithLifecycle()
    val localSummary by vm.localSummary.collectAsStateWithLifecycle()
    val localTree by vm.localTree.collectAsStateWithLifecycle()
    val sync by vm.syncState.collectAsStateWithLifecycle()
    val folderPattern by vm.folderPattern.collectAsStateWithLifecycle()
    var pattern by remember(folderPattern) { mutableStateOf(folderPattern ?: "") }
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val folderPicker = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.OpenDocumentTree()
    ) { uri ->
        if (uri != null) {
            runCatching { ctx.contentResolver.takePersistableUriPermission(uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            vm.setFolderPattern(pattern); vm.setLocalTree(uri.toString())
        }
    }

    val connectedLabel = stringResource(R.string.connected)
    val creditsLabel: (Int) -> String = { n -> ctx.getString(R.string.credits, n) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).padding(bottom = bottomPadding)) {
        Text("SUNODLAA v${com.soaresden.sunoauto.BuildConfig.VERSION_NAME}",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

        // ---- Language ----
        Spacer(Modifier.height(12.dp))
        Text(stringResource(R.string.section_language), style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(6.dp))
        LanguagePicker()
        Spacer(Modifier.height(16.dp)); HorizontalDivider()

        // ---- Compte ----
        Spacer(Modifier.height(12.dp))
        Text(stringResource(R.string.section_account), style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        if (loggedIn == true) {
            Text(
                buildString {
                    append(connectedLabel)
                    account?.let { append(" : $it") }
                    plan?.let { append(" · $it") }
                    credits?.let { append(" · " + creditsLabel(it)) }
                },
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                if (plan == "Pro") stringResource(R.string.settings_pro)
                else stringResource(R.string.settings_free),
                style = MaterialTheme.typography.bodySmall,
                color = if (plan == "Pro") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp)
            )
            Spacer(Modifier.height(8.dp))
            Button(onClick = { vm.sync() }, enabled = !sync.running) { Text(stringResource(R.string.sync_suno)) }
            OutlinedButton(onClick = onLogin, modifier = Modifier.padding(top = 6.dp)) { Text(stringResource(R.string.reconnect)) }
            TextButton(onClick = { vm.logout() }) { Text(stringResource(R.string.logout)) }
        } else {
            Text(stringResource(R.string.not_connected), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            Button(onClick = onLogin) { Text(stringResource(R.string.sign_in_suno)) }
        }
        if (sync.running) {
            Spacer(Modifier.height(6.dp))
            Text(stringResource(R.string.sync_running, sync.message.orEmpty()), style = MaterialTheme.typography.bodySmall)
            LinearProgressIndicator(progress = { sync.progress }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
        }

        // ---- Dossier local ----
        Spacer(Modifier.height(16.dp)); HorizontalDivider(); Spacer(Modifier.height(16.dp))
        Text(stringResource(R.string.section_local), style = MaterialTheme.typography.titleMedium)
        Text(
            stringResource(R.string.local_desc),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        OutlinedTextField(
            value = pattern, onValueChange = { pattern = it },
            label = { Text(stringResource(R.string.folder_pattern_label)) }, placeholder = { Text(stringResource(R.string.folder_pattern_placeholder)) },
            supportingText = { Text(stringResource(R.string.folder_pattern_help)) },
            singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
        )
        Spacer(Modifier.height(8.dp))
        if (localTree != null) {
            Button(onClick = { vm.setFolderPattern(pattern); vm.reimportLocal() }, enabled = !importState.running) { Text(stringResource(R.string.sync_folder)) }
            OutlinedButton(onClick = { folderPicker.launch(null) }, enabled = !importState.running, modifier = Modifier.padding(top = 6.dp)) { Text(stringResource(R.string.change_folder)) }
        } else {
            Button(onClick = { folderPicker.launch(null) }, enabled = !importState.running) { Text(stringResource(R.string.choose_folder)) }
        }
        if (importState.running) {
            Spacer(Modifier.height(6.dp))
            Text(importState.message ?: "…", style = MaterialTheme.typography.bodySmall)
            LinearProgressIndicator(progress = { if (importState.total > 0) importState.done.toFloat() / importState.total else 0f }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
        } else localSummary?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 6.dp))
        }

        // ---- Comment ça marche ----
        Spacer(Modifier.height(16.dp)); HorizontalDivider(); Spacer(Modifier.height(16.dp))
        Text(stringResource(R.string.how_it_works), style = MaterialTheme.typography.titleMedium)
        Text(
            stringResource(R.string.how_text),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        // ---- Données / diagnostic ----
        Spacer(Modifier.height(16.dp)); HorizontalDivider(); Spacer(Modifier.height(16.dp))
        Text(stringResource(R.string.section_data), style = MaterialTheme.typography.titleMedium)
        OutlinedButton(onClick = { vm.exportDatabase(ctx) }, modifier = Modifier.padding(top = 6.dp)) { Text(stringResource(R.string.export_db)) }
        OutlinedButton(onClick = { vm.exportDiagnostic(ctx) }, modifier = Modifier.padding(top = 6.dp)) { Text(stringResource(R.string.export_diag)) }

        // ---- Android Auto ----
        Spacer(Modifier.height(16.dp)); HorizontalDivider(); Spacer(Modifier.height(16.dp))
        Text("Android Auto", style = MaterialTheme.typography.titleMedium)
        Text(
            stringResource(R.string.aa_help),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
