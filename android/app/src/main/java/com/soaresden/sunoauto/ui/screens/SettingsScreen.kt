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

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).padding(bottom = bottomPadding)) {
        Text("Suno Auto Player v${com.soaresden.sunoauto.BuildConfig.VERSION_NAME}",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

        // ---- Compte ----
        Spacer(Modifier.height(12.dp))
        Text("Compte Suno", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        if (loggedIn == true) {
            Text(
                buildString {
                    append("Connecté")
                    account?.let { append(" : $it") }
                    plan?.let { append(" · $it") }
                    credits?.let { append(" · $it crédits") }
                },
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                if (plan == "Pro") "Compte Pro : tu possèdes tes morceaux, le bouton ⤓ peut les télécharger (quota)."
                else "Compte Free : Suno chiffre le streaming et n'autorise pas le téléchargement. Tes morceaux ne sont lisibles que si tu en as le fichier local.",
                style = MaterialTheme.typography.bodySmall,
                color = if (plan == "Pro") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp)
            )
            Spacer(Modifier.height(8.dp))
            Button(onClick = { vm.sync() }, enabled = !sync.running) { Text("Synchro Suno → Player") }
            OutlinedButton(onClick = onLogin, modifier = Modifier.padding(top = 6.dp)) { Text("Se reconnecter") }
            TextButton(onClick = { vm.logout() }) { Text("Se déconnecter (vide le cache)") }
        } else {
            Text("Non connecté.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            Button(onClick = onLogin) { Text("Se connecter à Suno") }
        }
        if (sync.running) {
            Spacer(Modifier.height(6.dp))
            Text("Synchro Suno… ${sync.message.orEmpty()}", style = MaterialTheme.typography.bodySmall)
            LinearProgressIndicator(progress = { sync.progress }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
        }

        // ---- Dossier local ----
        Spacer(Modifier.height(16.dp)); HorizontalDivider(); Spacer(Modifier.height(16.dp))
        Text("Synchro Local MP3 → Matching Suno", style = MaterialTheme.typography.titleMedium)
        Text(
            "Tes fichiers pour la lecture. Choisis le dossier qui contient tes dossiers de workspaces (dans le sélecteur, ouvre ☰ à gauche pour pCloud, Drive…). L'accès est mémorisé : ensuite un simple « Synchroniser » suffit.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        OutlinedTextField(
            value = pattern, onValueChange = { pattern = it },
            label = { Text("Modèle des dossiers (facultatif)") }, placeholder = { Text("ex. Suno -") },
            supportingText = { Text("Préfixe avant le nom du workspace. Vide = auto.") },
            singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
        )
        Spacer(Modifier.height(8.dp))
        if (localTree != null) {
            Button(onClick = { vm.setFolderPattern(pattern); vm.reimportLocal() }, enabled = !importState.running) { Text("Synchroniser le dossier") }
            OutlinedButton(onClick = { folderPicker.launch(null) }, enabled = !importState.running, modifier = Modifier.padding(top = 6.dp)) { Text("Changer de dossier") }
        } else {
            Button(onClick = { folderPicker.launch(null) }, enabled = !importState.running) { Text("Choisir le dossier") }
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
        Text("Comment ça marche", style = MaterialTheme.typography.titleMedium)
        Text(
            "• Synchro Suno → Player : récupère ta bibliothèque (workspaces, titres, favoris, originales). Marche en Free.\n" +
            "• Synchro Local MP3 → Matching Suno : associe tes fichiers aux titres pour la lecture.\n\n" +
            "En Free, tu n'es pas « propriétaire » des morceaux au sens de Suno : leur lecteur les déchiffre avec une licence, mais l'appli ne peut pas — donc un titre n'est lisible que via ton fichier local (✅). Les 🫥 n'ont pas de fichier. En Pro, tu possèdes tes morceaux et le bouton ⤓ les télécharge (quota).",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        // ---- Données / diagnostic ----
        Spacer(Modifier.height(16.dp)); HorizontalDivider(); Spacer(Modifier.height(16.dp))
        Text("Données", style = MaterialTheme.typography.titleMedium)
        OutlinedButton(onClick = { vm.exportDatabase(ctx) }, modifier = Modifier.padding(top = 6.dp)) { Text("Exporter la base (JSON, tous les tags)") }
        OutlinedButton(onClick = { vm.exportDiagnostic(ctx) }, modifier = Modifier.padding(top = 6.dp)) { Text("Exporter un diagnostic (zip)") }

        // ---- Android Auto ----
        Spacer(Modifier.height(16.dp)); HorizontalDivider(); Spacer(Modifier.height(16.dp))
        Text("Android Auto", style = MaterialTheme.typography.titleMedium)
        Text(
            "Hors Play Store : Android Auto → Paramètres → Version (taper 10×) → ⋮ → Paramètres développeur → « Sources inconnues ». L'appli apparaît alors dans la voiture.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
